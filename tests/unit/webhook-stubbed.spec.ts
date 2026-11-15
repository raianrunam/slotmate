import { expect, test } from "@playwright/test";
import Stripe from "stripe";

// Phase 17: the REAL webhook handler with STAND-INS for Stripe's answers and for the database
// (injected through WebhookDeps). The real signature check still runs. These pin rules that real
// Stripe objects cannot produce on demand (a state that changes between two reads), plus the
// Phase 16 review items LOW-1, LOW-2, LOW-3, MEDIUM-1 and MEDIUM-2.

const SECRET = "whsec_unit_stubbed_not_real";
const KEY = "sk_test_unit_stubbed_not_real";
const URL = "http://localhost/api/stripe/webhook";
const OWNER = "11111111-1111-4111-8111-111111111111";
const PRO = "price_unit_stubbed_pro";

const signed = (body: string) => new Stripe(KEY).webhooks.generateTestHeaderString({ payload: body, secret: SECRET });
const post = (body: string, headers: Record<string, string> = {}) => new Request(URL, { method: "POST", body, headers });

test.describe.configure({ mode: "serial" });

const saved = { ...process.env };
test.beforeEach(() => {
  process.env.STRIPE_SECRET_KEY = KEY;
  process.env.STRIPE_WEBHOOK_SECRET = SECRET;
  process.env.STRIPE_PRO_PRICE_ID = PRO;
  console.error = () => undefined;
});
test.afterEach(() => {
  for (const name of ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "STRIPE_PRO_PRICE_ID"]) {
    if (saved[name] === undefined) delete process.env[name];
    else process.env[name] = saved[name];
  }
});

const webhook = async () => await import("../../src/features/billing/webhook");

type Row = {
  owner_id: string;
  plan: string;
  status: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
};

/** afterFirstRead runs once, right after the handler has read the owner row (to change it behind the handler's back). */
function fakeAdmin(row: Row, afterFirstRead: () => void = () => undefined) {
  let readDone = false;
  const writes: Partial<Row>[] = [];
  const admin = {
    rpc: async (name: string) => ({ data: name === "claim_stripe_event" ? "claimed" : null, error: null }),
    from: () => ({
      select: () => ({
        eq: (column: keyof Row, value: string) => ({
          maybeSingle: async () => {
            const data = row[column] === value ? { ...row } : null;
            if (data && !readDone) {
              readDone = true;
              afterFirstRead();
            }
            return { data, error: null };
          },
        }),
      }),
      update: (patch: Partial<Row>) => {
        // Honours every filter, like the database: a write whose condition no longer matches changes nothing.
        const filters: [keyof Row, string | null][] = [];
        const builder = {
          eq: (column: keyof Row, value: string) => (filters.push([column, value]), builder),
          is: (column: keyof Row, value: null) => (filters.push([column, value]), builder),
          select: async () => {
            const matches = filters.every(([column, value]) => row[column] === value);
            if (!matches) return { data: [], error: null };
            writes.push(patch);
            Object.assign(row, patch);
            return { data: [{ owner_id: row.owner_id }], error: null };
          },
        };
        return builder;
      },
    }),
  };
  return { admin: admin as never, writes };
}

const storedRow = (sub: string | null = "sub_stored"): Row => ({
  owner_id: OWNER,
  plan: sub ? "pro" : "free",
  status: sub ? "active" : "canceled",
  stripe_customer_id: "cus_1",
  stripe_subscription_id: sub,
  current_period_end: null,
  cancel_at_period_end: false,
});

const subscription = (id: string, status: string, price = PRO) => ({
  id,
  status,
  customer: "cus_1",
  cancel_at_period_end: false,
  latest_invoice: "in_1",
  items: { data: [{ price: { id: price }, current_period_end: 1_900_000_000 }] },
});

/** Answers per subscription id, in order; the last answer repeats. Unknown id -> resource_missing. */
function stubStripe(answers: Record<string, unknown[]>, calls: string[] = [], onRetrieve: (id: string) => void = () => undefined, refundFails = false) {
  const stripe = new Stripe(KEY);
  const queue = Object.fromEntries(Object.entries(answers).map(([k, v]) => [k, [...v]]));
  const set = (target: object, name: string, fn: unknown) => ((target as Record<string, unknown>)[name] = fn);
  set(stripe.subscriptions, "retrieve", async (id: string) => {
    onRetrieve(id);
    const list = queue[id];
    if (!list?.length) throw Object.assign(new Error("none"), { code: "resource_missing" });
    return list.length > 1 ? list.shift() : list[0];
  });
  set(stripe.subscriptions, "cancel", async (id: string) => {
    calls.push(`cancel ${id}`);
    return {};
  });
  set(stripe.invoicePayments, "list", async () => ({ data: [{ payment: { type: "payment_intent", payment_intent: "pi_extra" } }] }));
  set(stripe.refunds, "create", async (p: { payment_intent: string }, options?: { idempotencyKey?: string }) => {
    if (refundFails) throw Object.assign(new Error("refund failed"), { code: "charge_already_refunded_or_other" });
    // The fixed idempotency key makes a retry unable to refund twice: a missing or wrong key shows in the calls.
    calls.push(options?.idempotencyKey === `slotmate-extra-refund-${p.payment_intent}` ? `refund ${p.payment_intent}` : `refund ${p.payment_intent} (NO KEY)`);
    return {};
  });
  return stripe;
}

async function send(stripe: Stripe, admin: never, type: string, object: Record<string, unknown>) {
  const body = JSON.stringify({ id: `evt_${Math.random().toString(36).slice(2)}`, object: "event", type, data: { object } });
  const { handleStripeWebhook } = await webhook();
  return await handleStripeWebhook(post(body, { "stripe-signature": signed(body) }), { stripe: () => stripe, admin: () => admin });
}

test("LOW-3: Stripe says active, then canceled -> the correction loop ends with a Free row", async () => {
  const row = storedRow();
  const { admin, writes } = fakeAdmin(row);
  const stripe = stubStripe({ sub_stored: [subscription("sub_stored", "active"), subscription("sub_stored", "canceled")] });
  const res = await send(stripe, admin, "customer.subscription.updated", { id: "sub_stored", customer: "cus_1" });
  expect(res.status).toBe(200);
  expect(writes.length, "first the active state, then the correction").toBe(2);
  expect(writes[0].plan).toBe("pro");
  expect(row.plan).toBe("free");
  expect(row.status).toBe("canceled");
  expect(row.stripe_subscription_id).toBeNull();
  expect(row.stripe_customer_id, "the customer id is kept").toBe("cus_1");
});

test("MEDIUM-1: the STORED subscription switched to another price ends Pro", async () => {
  const row = storedRow();
  const { admin } = fakeAdmin(row);
  const stripe = stubStripe({ sub_stored: [subscription("sub_stored", "active", "price_something_else")] });
  const res = await send(stripe, admin, "customer.subscription.updated", { id: "sub_stored", customer: "cus_1" });
  expect(res.status).toBe(200);
  expect(row.plan).toBe("free");
  expect(row.stripe_subscription_id).toBeNull();
  expect(row.stripe_customer_id).toBe("cus_1");
});

test("MEDIUM-1: a NOT-yet-stored subscription with another price is still not linked", async () => {
  const row = storedRow(null);
  const { admin, writes } = fakeAdmin(row);
  const stripe = stubStripe({ sub_new: [subscription("sub_new", "active", "price_something_else")] });
  const res = await send(stripe, admin, "checkout.session.completed", { mode: "subscription", subscription: "sub_new", customer: "cus_1", client_reference_id: OWNER });
  expect(res.status).toBe(200);
  expect(writes).toEqual([]);
  expect(row.plan).toBe("free");
});

test("MEDIUM-2: a second paid subscription is refunded and cancelled in Stripe; the stored row stays", async () => {
  const row = storedRow();
  const before = { ...row };
  const { admin, writes } = fakeAdmin(row);
  const calls: string[] = [];
  const stripe = stubStripe({ sub_stored: [subscription("sub_stored", "active")], sub_second: [subscription("sub_second", "active")] }, calls);
  const res = await send(stripe, admin, "customer.subscription.created", { id: "sub_second", customer: "cus_1" });
  expect(res.status).toBe(200);
  expect(calls).toEqual(["refund pi_extra", "cancel sub_second"]);
  expect(writes).toEqual([]);
  expect(row).toEqual(before);
});

test("MEDIUM-2: nothing is cancelled while the stored subscription is not live in Stripe (500, retried later)", async () => {
  const row = storedRow();
  const { admin } = fakeAdmin(row);
  const calls: string[] = [];
  const stripe = stubStripe({ sub_stored: [subscription("sub_stored", "canceled")], sub_second: [subscription("sub_second", "active")] }, calls);
  const res = await send(stripe, admin, "customer.subscription.created", { id: "sub_second", customer: "cus_1" });
  expect(res.status).toBe(500);
  expect(calls).toEqual([]);
});

test("LOW-2: a small body with a huge declared length is refused by the length check", async () => {
  const { handleStripeWebhook } = await webhook();
  const res = await handleStripeWebhook(post("{}", { "stripe-signature": signed("{}"), "content-length": "5000000" }));
  expect(res.status).toBe(413);
});

test("LOW-2: a chunked body without Content-Length stops being read once it passes the limit", async () => {
  const { readCappedBody } = await webhook();
  let pulled = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      pulled++;
      controller.enqueue(new Uint8Array(100_000));
      if (pulled > 1000) controller.close();
    },
  });
  const request = new Request(URL, { method: "POST", body: stream, duplex: "half" } as RequestInit);
  expect(await readCappedBody(request, 1_000_000)).toBeNull();
  expect(pulled, "stopped near the limit, not after 100 MB").toBeLessThan(20);
  expect(await readCappedBody(post("small"), 1_000_000)).toBe("small");
});

test("LOW-1: a rate-limit secret shorter than 32 characters fails closed; the log names the variable only", async () => {
  const { checkRate } = await import("../../src/lib/rate-limit");
  const logged: unknown[][] = [];
  console.error = (...a: unknown[]) => void logged.push(a);
  const before = process.env.RATE_LIMIT_SECRET;
  let called = 0;
  const check = async () => {
    called++;
    return { data: true, error: null };
  };
  const headers = () => new Headers({ "x-forwarded-for": "203.0.113.5" });
  try {
    process.env.RATE_LIMIT_SECRET = "short-secret-" + "x".repeat(18); // 31 characters
    expect(process.env.RATE_LIMIT_SECRET.length).toBe(31);
    expect(await checkRate(check, "ws", headers())).toBe("failed");
    expect(called).toBe(0);
    expect(JSON.stringify(logged)).toContain("RATE_LIMIT_SECRET");
    expect(JSON.stringify(logged)).not.toContain("short-secret");
    process.env.RATE_LIMIT_SECRET = "x".repeat(32);
    expect(await checkRate(check, "ws", headers())).toBe("allowed");
    expect(called).toBe(1);
  } finally {
    if (before === undefined) delete process.env.RATE_LIMIT_SECRET;
    else process.env.RATE_LIMIT_SECRET = before;
  }
});

test("Phase 17 MEDIUM-1: a write based on an OLD copy of the row changes nothing (500, retried with a fresh read)", async () => {
  // The owner has no subscription when the handler reads the row; while it waits for Stripe, another delivery links sub_other.
  const row = storedRow(null);
  const { admin, writes } = fakeAdmin(row, () => Object.assign(row, { plan: "pro", status: "active", stripe_subscription_id: "sub_other" }));
  const stripe = stubStripe({ sub_a: [subscription("sub_a", "canceled")] });
  const res = await send(stripe, admin, "customer.subscription.updated", { id: "sub_a", customer: "cus_1" });
  expect(res.status).toBe(500);
  expect(writes, "the stale write was refused by its condition").toEqual([]);
  expect(row.stripe_subscription_id, "the newer link survived").toBe("sub_other");
  expect(row.plan).toBe("pro");
});

test("Phase 17 MEDIUM-1: the extra subscription is not cancelled when the stored one changed meanwhile", async () => {
  const row = storedRow();
  const { admin } = fakeAdmin(row, () => {
    row.stripe_subscription_id = "sub_changed"; // changes right after the handler read the row
  });
  const calls: string[] = [];
  const stripe = stubStripe({ sub_stored: [subscription("sub_stored", "active")], sub_second: [subscription("sub_second", "active")] }, calls);
  const res = await send(stripe, admin, "customer.subscription.created", { id: "sub_second", customer: "cus_1" });
  expect(res.status).toBe(500);
  expect(calls).toEqual([]);
});

test("Phase 17: a failed refund leaves the extra subscription alive (500) so the next delivery tries again", async () => {
  const row = storedRow();
  const { admin } = fakeAdmin(row);
  const calls: string[] = [];
  const stripe = stubStripe({ sub_stored: [subscription("sub_stored", "active")], sub_second: [subscription("sub_second", "active")] }, calls, () => undefined, true);
  const res = await send(stripe, admin, "customer.subscription.created", { id: "sub_second", customer: "cus_1" });
  expect(res.status).toBe(500);
  expect(calls, "no cancel after a failed refund").toEqual([]);
});
