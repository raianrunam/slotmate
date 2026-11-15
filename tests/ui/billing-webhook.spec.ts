import { expect, test } from "@playwright/test";
import Stripe from "stripe";
import { serviceClient } from "../db/helpers";
import { LOGGED_OUT } from "./owner";
import { addResource, addWorkspace, cleanupOwners, logIn, newOwner, tag, type TestOwner } from "./owners";
import {
  createPayingCustomer,
  guardStripeVars,
  priceId,
  secretKey,
  sendEvent as send,
  stripeEvent as event,
  subscriptionRow as row,
} from "./stripe-helpers";

// Phase 15 integration: the REAL webhook of the running app, REAL Stripe test-mode objects (a customer with
// the test card pm_card_visa and a subscription to the Pro price), messages signed with the real signing
// secret using the Stripe library, and the real database. Nothing is paid by a person; no live mode.
//
// Covers BILL-05 / SEC-04 / A14 / T15 / T16 part 2 (as seen through the app): missing or wrong signature -> 400
// and no change; a valid message makes the owner Pro; the same message twice is handled once; a message whose
// body LIES about the state is ignored because the server asks Stripe; unknown subscriptions change nothing;
// cancel at period end; the subscription ending -> Free, everything locked, banner, owner's choice, exact unlock.
// Stripe test objects are removed at the end.

test.use({ storageState: LOGGED_OUT });
test.describe.configure({ mode: "serial" });
test.afterAll(cleanupOwners);

const missing = guardStripeVars(["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "STRIPE_PRO_PRICE_ID"]);
const service = serviceClient();

test.describe("Stripe webhook against the real app and Stripe test mode", () => {
  test.skip(missing.length > 0, `Missing in .env.local: ${missing.join(", ")}`);
  test.setTimeout(180_000);

  let owner: TestOwner;
  let stripe: Stripe;
  let customerId = "";
  let subscriptionId = "";
  const ids: { w1: string; w2: string; r: string[] } = { w1: "", w2: "", r: [] };

  test.beforeAll(async () => {
    stripe = new Stripe(secretKey!);
    owner = await newOwner();
    customerId = await createPayingCustomer(stripe, tag());
    const subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: priceId! }],
      metadata: { owner_id: owner.id },
    });
    subscriptionId = subscription.id;
    expect(subscription.status).toBe("active");
  });

  test.afterAll(async () => {
    // Remove the Stripe test objects (also the customer's subscriptions).
    if (subscriptionId) await stripe.subscriptions.cancel(subscriptionId).catch(() => undefined);
    if (customerId) await stripe.customers.del(customerId).catch(() => undefined);
  });

  test("no signature, a garbage signature, a wrong secret and a tampered body are all refused (400) and change nothing", async ({ request }) => {
    const e = event("checkout.session.completed", { mode: "subscription", subscription: subscriptionId, customer: customerId, client_reference_id: owner.id });
    for (const how of ["none", "garbage", "wrong-secret", "tampered"] as const) {
      const res = await send(request, e.payload, how);
      expect(res.status(), how).toBe(400);
    }
    const after = await row(owner.id);
    expect(after.plan).toBe("free");
    expect(after.stripe_subscription_id).toBeNull();
    expect(after.stripe_customer_id).toBeNull();
    // A refused message is not remembered: the same message, properly signed, is then handled.
    const ok = await send(request, e.payload);
    expect(ok.status()).toBe(200);
  });

  test("the verified checkout message made the owner Pro, from Stripe's own data", async () => {
    const after = await row(owner.id);
    expect(after.plan).toBe("pro");
    expect(after.status).toBe("active");
    expect(after.stripe_subscription_id).toBe(subscriptionId);
    expect(after.stripe_customer_id).toBe(customerId);
    expect(after.cancel_at_period_end).toBe(false);
    expect(new Date(after.current_period_end!).getTime()).toBeGreaterThan(Date.now());
    const plan = await service.rpc("current_plan", { p_owner_id: owner.id });
    expect(plan.data).toBe("pro");
  });

  test("Pro limits work at once: five workspaces allowed, the sixth refused", async () => {
    ids.w1 = await addWorkspace(owner, `Hook ${tag()}`);
    ids.w2 = await addWorkspace(owner, `Hook ${tag()}`);
    ids.r = [];
    for (const n of [1, 2, 3, 4]) ids.r.push(await addResource(owner, ids.w1, `Resource ${n}`));
    ids.r.push(await addResource(owner, ids.w2, "Other resource"));
    for (let i = 0; i < 3; i++) await addWorkspace(owner, `Extra ${i}`);
    await expect(addWorkspace(owner, "Sixth")).rejects.toThrow(/workspace_limit_reached/);
    // Put it back to two workspaces for the downgrade scenario.
    const extras = await owner.client.from("workspaces").select("id, name").like("name", "Extra %");
    for (const w of extras.data ?? []) await owner.client.from("workspaces").delete().eq("id", w.id);
  });

  test("the same message twice is handled once (T15)", async ({ request }) => {
    const e = event("customer.subscription.updated", { id: subscriptionId, customer: customerId });
    const first = await send(request, e.payload);
    expect(first.status()).toBe(200);
    expect((await first.json()).duplicate).toBeUndefined();
    // A marker we can see: if the repeat were processed again, Stripe's data would overwrite it.
    const mark = await service.from("subscriptions").update({ status: "marker" }).eq("owner_id", owner.id);
    expect(mark.error).toBeNull();
    const second = await send(request, e.payload);
    expect(second.status()).toBe(200);
    expect((await second.json()).duplicate).toBe(true);
    expect((await row(owner.id)).status, "the repeat did nothing").toBe("marker");
  });

  test("a message that lies about the state is ignored: the server asks Stripe (A14)", async ({ request }) => {
    const lie = event("customer.subscription.updated", { id: subscriptionId, customer: customerId, status: "canceled", cancel_at_period_end: true });
    expect((await send(request, lie.payload)).status()).toBe(200);
    const after = await row(owner.id);
    expect(after.status, "Stripe says active").toBe("active");
    expect(after.plan).toBe("pro");
    expect(after.cancel_at_period_end).toBe(false);
  });

  test("an unknown subscription, and an event type we do not handle, change nothing", async ({ request }) => {
    const before = await row(owner.id);
    const unknown = event("customer.subscription.deleted", { id: "sub_does_not_exist_" + tag(), customer: "cus_does_not_exist_" + tag() });
    expect((await send(request, unknown.payload)).status()).toBe(200);
    const other = event("invoice.paid", { id: "in_1" });
    const res = await send(request, other.payload);
    expect(res.status()).toBe(200);
    expect((await res.json()).handled).toBe(false);
    const after = await row(owner.id);
    expect(after.plan).toBe(before.plan);
    expect(after.stripe_subscription_id).toBe(before.stripe_subscription_id);
  });

  test("cancelling at the end of the period keeps Pro and the page says Pro until the date", async ({ request, page }) => {
    await stripe.subscriptions.update(subscriptionId, { cancel_at_period_end: true });
    const e = event("customer.subscription.updated", { id: subscriptionId, customer: customerId });
    expect((await send(request, e.payload)).status()).toBe(200);
    const after = await row(owner.id);
    expect(after.plan).toBe("pro");
    expect(after.cancel_at_period_end).toBe(true);

    await logIn(page, owner);
    await page.goto("/dashboard/billing");
    await expect(page.getByTestId("current-plan")).toHaveText("Pro");
    await expect(page.getByTestId("plan-line")).toContainText("Pro until");
    await expect(page.getByTestId("plan-line")).toContainText("will not renew");
    await expect(page.getByRole("button", { name: "Manage subscription" }).first()).toBeVisible();
    await expect(page.getByTestId("upgrade-button")).toHaveCount(0);
    await expect(page.getByTestId("downgrade-banner")).toHaveCount(0);
  });

  test("the subscription ending: Free, everything locked, banner, the owner chooses, exactly that is unlocked", async ({ request, page }) => {
    await stripe.subscriptions.cancel(subscriptionId);
    const e = event("customer.subscription.deleted", { id: subscriptionId, customer: customerId, status: "active" });
    expect((await send(request, e.payload)).status()).toBe(200);
    const after = await row(owner.id);
    expect(after.plan).toBe("free");
    expect(after.stripe_subscription_id).toBeNull();
    const state = await owner.client.from("workspaces").select("is_locked");
    expect((state.data ?? []).every((w) => w.is_locked), "everything locked, nothing chosen for the owner").toBe(true);
    const res = await owner.client.from("resources").select("is_locked");
    expect((res.data ?? []).length).toBe(5);
    expect((res.data ?? []).every((r) => r.is_locked)).toBe(true);

    await logIn(page, owner);
    await expect(page.getByTestId("downgrade-banner")).toBeVisible();
    await page.getByRole("link", { name: "Choose what to keep" }).first().click();
    await page.waitForURL("**/dashboard/billing/downgrade");

    // Nothing is pre-selected.
    for (const radio of await page.getByRole("radio").all()) await expect(radio).not.toBeChecked();
    await expect(page.getByRole("checkbox")).toHaveCount(0);

    const name = (await owner.client.from("workspaces").select("name").eq("id", ids.w1).single()).data!.name;
    await page.getByRole("radio", { name }).check();
    await expect(page.getByRole("checkbox")).toHaveCount(4);
    await page.getByRole("checkbox", { name: "Resource 1" }).check();
    await page.getByRole("checkbox", { name: "Resource 3" }).check();
    await page.getByRole("checkbox", { name: "Resource 4" }).check();
    await expect(page.getByRole("checkbox", { name: "Resource 2" }), "a fourth cannot be ticked").toBeDisabled();
    await page.getByRole("button", { name: "Keep this selection" }).click();
    await page.waitForURL("**/dashboard/billing?notice=selection_saved");
    await expect(page.getByTestId("billing-notice")).toBeVisible();
    await expect(page.getByTestId("downgrade-banner")).toHaveCount(0);

    const w = await owner.client.from("workspaces").select("id, is_locked");
    expect((w.data ?? []).filter((x) => !x.is_locked).map((x) => x.id)).toEqual([ids.w1]);
    const r = await owner.client.from("resources").select("id, name, is_locked");
    expect((r.data ?? []).filter((x) => !x.is_locked).map((x) => x.name).sort()).toEqual(["Resource 1", "Resource 3", "Resource 4"]);
    expect((r.data ?? []).filter((x) => x.is_locked)).toHaveLength(2);
  });
});
