import { expect, test } from "@playwright/test";
import Stripe from "stripe";
import { LOGGED_OUT } from "./owner";
import { cleanupOwners, newOwner, tag, type TestOwner } from "./owners";
import {
  createPayingCustomer,
  guardStripeVars,
  priceId,
  secretKey,
  sendEvent,
  stripeEvent,
  subscriptionRow,
} from "./stripe-helpers";

// Phase 15 review (finding 5): the risky webhook paths, against the REAL app and REAL Stripe test objects.
//   * an OLD subscription that ended while a newer one is current          -> the stored row is unchanged
//   * a second subscription for the same owner                             -> the stored one is not overwritten
//   * a subscription with another price (not our Pro price)                -> the owner does not become Pro
//   * different messages for one subscription arriving at the same time    -> the final row matches Stripe
// Stripe test objects (customers, subscriptions, the extra product) are removed at the end.

test.use({ storageState: LOGGED_OUT });
test.describe.configure({ mode: "serial" });
test.afterAll(cleanupOwners);

const missing = guardStripeVars(["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "STRIPE_PRO_PRICE_ID"]);

test.describe("webhook guards with real Stripe objects", () => {
  test.skip(missing.length > 0, `Missing in .env.local: ${missing.join(", ")}`);
  test.setTimeout(180_000);

  let stripe: Stripe;
  let owner: TestOwner;
  let customerId = "";
  let currentSub = ""; // the subscription the owner is linked to
  const customers: string[] = [];
  const subscriptions: string[] = [];
  let productId = "";

  const proSubscription = async (customer: string, ownerId: string) => {
    const s = await stripe.subscriptions.create({ customer, items: [{ price: priceId! }], metadata: { owner_id: ownerId } });
    subscriptions.push(s.id);
    expect(s.status).toBe("active");
    return s.id;
  };

  test.beforeAll(async ({ request }) => {
    stripe = new Stripe(secretKey!);
    owner = await newOwner();
    customerId = await createPayingCustomer(stripe, `guards ${tag()}`);
    customers.push(customerId);
    currentSub = await proSubscription(customerId, owner.id);
    // Link the owner the way Checkout would (a signed message with the owner id).
    const link = stripeEvent("checkout.session.completed", { mode: "subscription", subscription: currentSub, customer: customerId, client_reference_id: owner.id });
    expect((await sendEvent(request, link.payload)).status()).toBe(200);
    const row = await subscriptionRow(owner.id);
    expect(row.plan).toBe("pro");
    expect(row.stripe_subscription_id).toBe(currentSub);
  });

  test.afterAll(async () => {
    for (const id of subscriptions) await stripe.subscriptions.cancel(id).catch(() => undefined);
    for (const id of customers) await stripe.customers.del(id).catch(() => undefined);
    if (productId) await stripe.products.update(productId, { active: false }).catch(() => undefined);
  });

  test("an OLD subscription ending while a newer one is current leaves the row unchanged", async ({ request }) => {
    const old = await proSubscription(customerId, owner.id);
    await stripe.subscriptions.cancel(old);
    const before = await subscriptionRow(owner.id);
    const e = stripeEvent("customer.subscription.deleted", { id: old, customer: customerId });
    expect((await sendEvent(request, e.payload)).status()).toBe(200);
    expect(await subscriptionRow(owner.id)).toEqual(before);
    expect(before.stripe_subscription_id).toBe(currentSub);
    expect(before.plan).toBe("pro");
  });

  test("a second paid subscription for the same owner does not overwrite the stored one", async ({ request }) => {
    const second = await proSubscription(customerId, owner.id);
    const before = await subscriptionRow(owner.id);
    for (const type of ["customer.subscription.created", "customer.subscription.updated"]) {
      const e = stripeEvent(type, { id: second, customer: customerId });
      expect((await sendEvent(request, e.payload)).status(), type).toBe(200);
    }
    const checkout = stripeEvent("checkout.session.completed", { mode: "subscription", subscription: second, customer: customerId, client_reference_id: owner.id });
    expect((await sendEvent(request, checkout.payload)).status()).toBe(200);
    const after = await subscriptionRow(owner.id);
    expect(after).toEqual(before);
    expect(after.stripe_subscription_id, "still the first one").toBe(currentSub);
    // Phase 17 (Phase 16 MEDIUM-2): the extra subscription is cancelled in Stripe and its payment refunded.
    const extra = await stripe.subscriptions.retrieve(second);
    expect(extra.status, "the extra subscription is cancelled").toBe("canceled");
    const invoiceId = typeof extra.latest_invoice === "string" ? extra.latest_invoice : extra.latest_invoice!.id;
    const paid = await stripe.invoicePayments.list({ invoice: invoiceId, status: "paid" });
    expect(paid.data.length).toBeGreaterThan(0);
    const pi = paid.data[0].payment.payment_intent;
    const refunds = await stripe.refunds.list({ payment_intent: typeof pi === "string" ? pi : pi!.id });
    expect(refunds.data.length, "one refund").toBe(1);
    expect(refunds.data[0].status).not.toBe("failed");
    // The stored subscription is untouched and still live.
    expect((await stripe.subscriptions.retrieve(currentSub)).status).toBe("active");
  });

  test("the STORED subscription switched to another price ends Pro (Phase 16 MEDIUM-1)", async ({ request }) => {
    const switcher = await newOwner();
    const switchCustomer = await createPayingCustomer(stripe, `switch ${tag()}`);
    customers.push(switchCustomer);
    const sub = await stripe.subscriptions.create({ customer: switchCustomer, items: [{ price: priceId! }], metadata: { owner_id: switcher.id } });
    subscriptions.push(sub.id);
    const link = stripeEvent("checkout.session.completed", { mode: "subscription", subscription: sub.id, customer: switchCustomer, client_reference_id: switcher.id });
    expect((await sendEvent(request, link.payload)).status()).toBe(200);
    expect((await subscriptionRow(switcher.id)).plan).toBe("pro");

    // Same subscription, but it now sits on a different price (what a price rotation or a portal plan switch does).
    if (!productId) {
      productId = (await stripe.products.create({ name: `slotmate-test other ${tag()}`, metadata: { slotmate_test: "1" } })).id;
    }
    await stripe.subscriptions.update(sub.id, {
      proration_behavior: "none",
      items: [{ id: sub.items.data[0].id, price_data: { currency: "usd", product: productId, unit_amount: 300, recurring: { interval: "month" } } }],
    });
    const changed = await stripe.subscriptions.retrieve(sub.id);
    expect(changed.status).toBe("active");
    expect(changed.items.data[0].price.id).not.toBe(priceId);

    const e = stripeEvent("customer.subscription.updated", { id: sub.id, customer: switchCustomer });
    expect((await sendEvent(request, e.payload)).status()).toBe(200);
    const row = await subscriptionRow(switcher.id);
    expect(row.plan, "no Pro price any more -> not Pro").toBe("free");
    expect(row.stripe_subscription_id).toBeNull();
    expect(row.stripe_customer_id, "customer kept").toBe(switchCustomer);
  });

  test("a subscription with another price does not make the owner Pro", async ({ request }) => {
    const other = await newOwner();
    const otherCustomer = await createPayingCustomer(stripe, `wrong-price ${tag()}`);
    customers.push(otherCustomer);
    const product = await stripe.products.create({ name: `slotmate-test other ${tag()}`, metadata: { slotmate_test: "1" } });
    productId = product.id;
    const sub = await stripe.subscriptions.create({
      customer: otherCustomer,
      items: [{ price_data: { currency: "usd", product: product.id, unit_amount: 500, recurring: { interval: "month" } } }],
      metadata: { owner_id: other.id },
    });
    subscriptions.push(sub.id);
    expect(sub.status).toBe("active");
    expect(sub.items.data[0].price.id).not.toBe(priceId);

    const before = await subscriptionRow(other.id);
    const messages = [
      stripeEvent("checkout.session.completed", { mode: "subscription", subscription: sub.id, customer: otherCustomer, client_reference_id: other.id }),
      stripeEvent("customer.subscription.created", { id: sub.id, customer: otherCustomer }),
      stripeEvent("customer.subscription.updated", { id: sub.id, customer: otherCustomer }),
    ];
    for (const m of messages) expect((await sendEvent(request, m.payload)).status()).toBe(200);
    const after = await subscriptionRow(other.id);
    expect(after.plan).toBe("free");
    expect(after.stripe_subscription_id).toBeNull();
    expect(after).toEqual(before);
  });

  test("different messages for one subscription at the same time end in Stripe's current state", async ({ request }) => {
    await stripe.subscriptions.cancel(currentSub);
    const kinds = ["customer.subscription.updated", "customer.subscription.deleted", "customer.subscription.updated", "customer.subscription.deleted", "customer.subscription.created"];
    const sends = kinds.map((type) => stripeEvent(type, { id: currentSub, customer: customerId, status: "active" }));
    const results = await Promise.all(sends.map((m) => sendEvent(request, m.payload)));
    for (const r of results) expect(r.status()).toBe(200);
    const stripeState = await stripe.subscriptions.retrieve(currentSub);
    expect(stripeState.status).toBe("canceled");
    const row = await subscriptionRow(owner.id);
    expect(row.plan, "matches Stripe: cancelled").toBe("free");
    expect(row.stripe_subscription_id).toBeNull();
    expect(row.status).toBe("canceled");
  });
});
