import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import Stripe from "stripe";
import {
  containsProPrice,
  decideWrite,
  sameRow,
  endedRow,
  eventTarget,
  hasValidSelection,
  isHandledEvent,
  mapSelectionError,
  mapSubscription,
  overFreeLimits,
  selectionNeeded,
  SELECTION_MESSAGES,
  type SelResource,
  type SelWorkspace,
  type StripeSubscriptionLike,
} from "../../src/features/billing/schema";
import { effectivePlan } from "../../src/lib/plans";

// Phase 15: billing rules that need no browser, server, database or network.

const read = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8");

const SECRET = "whsec_unit_test_secret_not_real";

// The real Stripe library checks signatures: a wrong or missing signature must be refused (SEC-04).
test("signature check: a correct signature is accepted, anything else is refused", () => {
  const stripe = new Stripe("sk_test_unit_not_real");
  const payload = JSON.stringify({ id: "evt_1", object: "event", type: "customer.subscription.updated", data: { object: {} } });
  const good = stripe.webhooks.generateTestHeaderString({ payload, secret: SECRET });
  expect(stripe.webhooks.constructEvent(payload, good, SECRET).id).toBe("evt_1");

  const wrongSecret = stripe.webhooks.generateTestHeaderString({ payload, secret: "whsec_other" });
  expect(() => stripe.webhooks.constructEvent(payload, wrongSecret, SECRET)).toThrow();
  expect(() => stripe.webhooks.constructEvent(payload + " ", good, SECRET), "body changed after signing").toThrow();
  expect(() => stripe.webhooks.constructEvent(payload, "t=1,v1=00", SECRET)).toThrow();
  expect(() => stripe.webhooks.constructEvent(payload, "", SECRET)).toThrow();
  const old = stripe.webhooks.generateTestHeaderString({ payload, secret: SECRET, timestamp: Math.floor(Date.now() / 1000) - 3600 });
  expect(() => stripe.webhooks.constructEvent(payload, old, SECRET), "replay of an old message").toThrow();
});

test("event routing: only the four documented types are handled", () => {
  for (const type of ["checkout.session.completed", "customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted"]) {
    expect(isHandledEvent(type), type).toBe(true);
  }
  for (const type of ["invoice.paid", "customer.created", "payment_intent.succeeded", ""]) {
    expect(isHandledEvent(type), type).toBe(false);
    expect(eventTarget({ type, data: { object: { id: "sub_1" } } })).toBeNull();
  }
});

test("event routing: only identifiers are read from a message, never state", () => {
  const checkout = eventTarget({
    type: "checkout.session.completed",
    data: { object: { mode: "subscription", subscription: "sub_1", customer: "cus_1", client_reference_id: "owner-1", status: "complete", plan: "pro" } },
  });
  expect(checkout).toEqual({ subscriptionId: "sub_1", customerId: "cus_1", clientReferenceId: "owner-1", deleted: false });
  expect(Object.keys(checkout!).sort()).toEqual(["clientReferenceId", "customerId", "deleted", "subscriptionId"]);

  expect(eventTarget({ type: "checkout.session.completed", data: { object: { mode: "payment", subscription: null } } })).toBeNull();
  expect(eventTarget({ type: "checkout.session.completed", data: { object: { mode: "subscription", subscription: null } } })).toBeNull();

  const updated = eventTarget({ type: "customer.subscription.updated", data: { object: { id: "sub_2", customer: { id: "cus_2" }, status: "canceled" } } });
  expect(updated).toEqual({ subscriptionId: "sub_2", customerId: "cus_2", clientReferenceId: null, deleted: false });
  const deleted = eventTarget({ type: "customer.subscription.deleted", data: { object: { id: "sub_3", customer: "cus_3" } } });
  expect(deleted?.deleted).toBe(true);
  expect(eventTarget({ type: "customer.subscription.updated", data: { object: {} } })).toBeNull();
});

const sub = (over: Partial<StripeSubscriptionLike> = {}): StripeSubscriptionLike => ({
  id: "sub_1",
  status: "active",
  customer: "cus_1",
  cancel_at_period_end: false,
  items: { data: [{ current_period_end: 1_900_000_000 }] },
  ...over,
});

test("plan mapping (DB7): active and trialing are Pro; ended or never-started are Free", () => {
  for (const status of ["active", "trialing"]) {
    const row = mapSubscription(sub({ status }));
    expect(row.plan).toBe("pro");
    expect(row.stripe_subscription_id).toBe("sub_1");
    expect(row.stripe_customer_id).toBe("cus_1");
    expect(row.current_period_end).toBe(new Date(1_900_000_000 * 1000).toISOString());
    expect(effectivePlan(row), status).toBe("pro");
  }
  for (const status of ["canceled", "incomplete_expired", "incomplete"]) {
    const row = mapSubscription(sub({ status }));
    expect(row.plan, status).toBe("free");
    expect(row.stripe_subscription_id).toBeNull();
    expect(row.current_period_end).toBeNull();
    expect(effectivePlan(row)).toBe("free");
  }
});

test("plan mapping (DB7): past_due and unpaid keep the Pro record but do not count as Pro", () => {
  for (const status of ["past_due", "unpaid", "paused"]) {
    const row = mapSubscription(sub({ status }));
    expect(row.plan).toBe("pro");
    expect(row.stripe_subscription_id).toBe("sub_1");
    expect(effectivePlan(row), status).toBe("free");
  }
});

test("plan mapping: cancel-at-period-end keeps Pro and records the end date; the latest item end wins", () => {
  const row = mapSubscription(sub({ cancel_at_period_end: true, items: { data: [{ current_period_end: 1_800_000_000 }, { current_period_end: 1_900_000_000 }] } }));
  expect(row.plan).toBe("pro");
  expect(row.cancel_at_period_end).toBe(true);
  expect(row.current_period_end).toBe(new Date(1_900_000_000 * 1000).toISOString());
  expect(mapSubscription(sub({ customer: { id: "cus_9" } })).stripe_customer_id).toBe("cus_9");
  expect(mapSubscription(sub({ items: { data: [] } })).current_period_end).toBeNull();
});

test("ended row: Free, no subscription id, keeps the customer", () => {
  expect(endedRow("cus_1")).toMatchObject({ plan: "free", status: "canceled", stripe_subscription_id: null, stripe_customer_id: "cus_1", cancel_at_period_end: false });
});

// ---- Downgrade selection rules (DATABASE.md 7.8) ----
const W = (id: string, locked = false): SelWorkspace => ({ id, name: id, is_locked: locked });
const R = (id: string, workspace: string, locked = false): SelResource => ({ id, name: id, workspace_id: workspace, is_locked: locked });

test("over the Free limits: more than 1 workspace or more than 3 resources", () => {
  expect(overFreeLimits([1], [1, 2, 3])).toBe(false);
  expect(overFreeLimits([1, 2], [])).toBe(true);
  expect(overFreeLimits([1], [1, 2, 3, 4])).toBe(true);
  expect(overFreeLimits([], [])).toBe(false);
});

test("valid selection: exactly one unlocked workspace, at most three unlocked resources, all inside it", () => {
  const ws = [W("a"), W("b", true)];
  expect(hasValidSelection(ws, [R("1", "a"), R("2", "a"), R("3", "a"), R("4", "a", true)])).toBe(true);
  expect(hasValidSelection(ws, [R("1", "a"), R("2", "a"), R("3", "a"), R("4", "a")]), "four unlocked").toBe(false);
  expect(hasValidSelection(ws, [R("1", "b")]), "unlocked resource in another workspace").toBe(false);
  expect(hasValidSelection([W("a", true), W("b", true)], []), "empty unlocked set is not valid").toBe(false);
  expect(hasValidSelection([W("a"), W("b")], []), "two unlocked workspaces").toBe(false);
  expect(hasValidSelection(ws, []), "a workspace with no resources is a valid choice").toBe(true);
});

test("the owner is asked to choose only on Free, over the limits, without a valid selection (never chosen for them)", () => {
  const over = [W("a", true), W("b", true)];
  expect(selectionNeeded("free", over, [])).toBe(true);
  expect(selectionNeeded("pro", over, [])).toBe(false);
  expect(selectionNeeded("free", [W("a")], [R("1", "a")]), "within the limits").toBe(false);
  expect(selectionNeeded("free", [W("a"), W("b", true)], [R("1", "a")]), "already chosen").toBe(false);
});

test("selection errors map to fixed sentences and never echo database text", () => {
  expect(mapSelectionError({ message: "selection_not_needed" })).toBe(SELECTION_MESSAGES.notNeeded);
  expect(mapSelectionError({ message: "invalid_selection" })).toBe(SELECTION_MESSAGES.invalid);
  const odd = mapSelectionError({ code: "XX000", message: "secret internal detail" });
  expect(odd).toBe(SELECTION_MESSAGES.generic);
  expect(odd).not.toContain("secret");
});

// ---- Source guards for the webhook design (A14, SEC-04) ----
test("webhook source: raw body, signature first, then claim, then Stripe's own answer, then mark", () => {
  const src = read("src/features/billing/webhook.ts");
  expect(src).toContain("request.text()");
  expect(src).not.toMatch(/request\.(json|formData)\(/);
  const order = ["constructEvent(", 'rpc("claim_stripe_event"', "await fetchSubscription(", "await saveRow("].map((s) => src.indexOf(s));
  order.push(src.lastIndexOf("await markProcessed()")); // the final "done" answer, after the save
  expect(src).toContain('rpc("mark_stripe_event_processed"');
  expect(src).toContain("subscriptions.retrieve(");
  expect(src, "the replay window is explicit").toContain("SIGNATURE_TOLERANCE_SECONDS");
  expect(src, "a missing setting is told apart by type, not wording").toMatch(/instanceof ConfigError/);
  expect(src).not.toContain("startsWith(\"Missing");
  expect(order.every((i) => i > 0), "every step exists").toBe(true);
  expect([...order].sort((a, b) => a - b)).toEqual(order);
  // State comes from Stripe's answer, never from the message body.
  expect(src).not.toMatch(/data\.object/);
  expect(src).not.toMatch(/event\.data/);
});

test("webhook source: bad signature answers 400 before the admin connection exists", () => {
  const src = read("src/features/billing/webhook.ts");
  // Both 400 branches (no header, and a signature that does not verify) come before the admin connection exists.
  const last400 = src.lastIndexOf("json(400");
  expect(src.indexOf("json(400")).toBeGreaterThan(0);
  expect(last400).toBeGreaterThan(src.indexOf("constructEvent("));
  expect(last400).toBeLessThan(src.indexOf("createAdminClient()", src.indexOf("async function handle")));
  expect(src.indexOf("json(413")).toBeLessThan(src.indexOf("request.text()"));
});

test("billing actions: owner check first, no plan write, success never changes the plan", () => {
  const actions = read("src/features/billing/actions.ts");
  for (const name of ["startCheckout", "openCustomerPortal"]) {
    const body = actions.slice(actions.indexOf(`export async function ${name}`));
    expect(body.indexOf("requireOwner()"), name).toBeGreaterThan(0);
    expect(body.indexOf("requireOwner()"), name).toBeLessThan(body.indexOf("getStripe()"));
  }
  expect(actions).not.toMatch(/\.update\(|\.insert\(|\.upsert\(|createAdminClient/);
  const selection = read("src/features/billing/downgrade-actions.ts");
  expect(selection.indexOf("requireOwner()")).toBeLessThan(selection.indexOf("createAdminClient()"));
  expect(selection).toMatch(/apply_downgrade_selection/);
  // No automatic choice anywhere in billing code.
  for (const f of ["schema.ts", "queries.ts", "downgrade-actions.ts", "components/selection-form.tsx"]) {
    expect(read(`src/features/billing/${f}`), f).not.toMatch(/oldest|created_at.*slice|\.slice\(0,\s*3\)/);
  }
});

test("billing logs carry codes only", () => {
  for (const f of ["webhook.ts", "actions.ts", "downgrade-actions.ts", "queries.ts"]) {
    for (const m of read(`src/features/billing/${f}`).matchAll(/console\.\w+\(([^;]*)\);/g)) {
      expect(m[1], `${f} log call`).toMatch(/code/);
      expect(m[1], `${f} log call`).not.toMatch(/email|secret|signature|raw|formData|message|JSON/i);
    }
  }
});

// ---- Review fixes (Phase 15 review) ----
test("only a subscription with our Pro price counts", () => {
  const sub = (...ids: string[]) => ({ items: { data: ids.map((id) => ({ price: { id } })) } });
  expect(containsProPrice(sub("price_pro"), "price_pro")).toBe(true);
  expect(containsProPrice(sub("price_other"), "price_pro")).toBe(false);
  expect(containsProPrice(sub("price_other", "price_pro"), "price_pro")).toBe(true);
  expect(containsProPrice({ items: { data: [] } }, "price_pro")).toBe(false);
  expect(containsProPrice({ items: { data: [{ price: null }] } }, "price_pro")).toBe(false);
});

test("write decision: a stale ending or a second paid subscription never replaces the stored one", () => {
  const pro = { plan: "pro" as const };
  const free = { plan: "free" as const };
  expect(decideWrite(pro, null, "sub_a"), "first subscription").toBe("save");
  expect(decideWrite(pro, "sub_a", "sub_a"), "same subscription updated").toBe("save");
  expect(decideWrite(free, "sub_a", "sub_a"), "the current subscription ends").toBe("save");
  expect(decideWrite(free, "sub_a", "sub_old"), "an OLD subscription ends while a newer one is stored").toBe("ignore_stale_end");
  expect(decideWrite(pro, "sub_a", "sub_b"), "a second paid subscription").toBe("ignore_second");
  expect(decideWrite(free, null, "sub_a"), "nothing stored").toBe("save");
});

test("sameRow compares every field", () => {
  const row = mapSubscription(sub());
  expect(sameRow(row, { ...row })).toBe(true);
  expect(sameRow(row, { ...row, status: "canceled" })).toBe(false);
});

test("the Stripe client has a timeout, a retry limit and a typed configuration error", () => {
  const client = read("src/lib/stripe/client.ts");
  expect(client).toMatch(/timeout: 15_000/);
  expect(client).toMatch(/class ConfigError extends Error/);
  expect(client).toMatch(/SIGNATURE_TOLERANCE_SECONDS = 300/);
});

test("the billing page does not offer a second payment while a payment is being confirmed", () => {
  const page = read("src/app/dashboard/billing/page.tsx");
  const waiting = page.indexOf('params.checkout === "success" ? (');
  expect(waiting).toBeGreaterThan(0);
  expect(page.indexOf("upgrade-waiting")).toBeGreaterThan(waiting);
  expect(page.indexOf("action={startCheckout}")).toBeGreaterThan(page.indexOf("upgrade-waiting"));
});
