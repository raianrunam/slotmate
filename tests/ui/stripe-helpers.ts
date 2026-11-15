import { test, type APIRequestContext } from "@playwright/test";
import { randomBytes } from "node:crypto";
import Stripe from "stripe";
import { serviceClient } from "../db/helpers";

// Shared by the Phase 15 Stripe tests. Real Stripe TEST-mode objects and messages signed with the real
// signing secret. Nothing is paid by a person; no live mode.

export const secretKey = process.env.STRIPE_SECRET_KEY;
export const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
export const priceId = process.env.STRIPE_PRO_PRICE_ID;

export type StripeVar = "STRIPE_SECRET_KEY" | "STRIPE_WEBHOOK_SECRET" | "STRIPE_PRO_PRICE_ID";
const values: Record<StripeVar, string | undefined> = {
  STRIPE_SECRET_KEY: secretKey,
  STRIPE_WEBHOOK_SECRET: webhookSecret,
  STRIPE_PRO_PRICE_ID: priceId,
};

export const missingStripeVars = (names: StripeVar[]): StripeVar[] => names.filter((n) => !values[n]);

/**
 * Registers a test that FAILS when the variables are missing and CI is set (a skipped Stripe test must
 * never look like a pass in CI). On a developer machine without the variables the Stripe tests are skipped.
 * Returns the missing names so the caller can skip its own tests.
 */
export function guardStripeVars(names: StripeVar[]): StripeVar[] {
  const missing = missingStripeVars(names);
  test("the Stripe test variables are set (this fails, not skips, when CI is set)", () => {
    if (missing.length > 0 && process.env.CI) {
      throw new Error(`CI is set but these Stripe variables are missing: ${missing.join(", ")}`);
    }
    test.skip(missing.length > 0, `Missing in .env.local: ${missing.join(", ")}`);
  });
  return missing;
}

export const WEBHOOK_PATH = "/api/stripe/webhook";

export function stripeEvent(type: string, object: Record<string, unknown>, id = `evt_test_${randomBytes(10).toString("hex")}`) {
  return { id, payload: JSON.stringify({ id, object: "event", type, created: Math.floor(Date.now() / 1000), data: { object } }) };
}

export async function sendEvent(
  request: APIRequestContext,
  payload: string,
  how: "valid" | "none" | "garbage" | "wrong-secret" | "tampered" = "valid",
) {
  const stripe = new Stripe(secretKey!);
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (how === "valid") headers["stripe-signature"] = stripe.webhooks.generateTestHeaderString({ payload, secret: webhookSecret! });
  if (how === "wrong-secret") headers["stripe-signature"] = stripe.webhooks.generateTestHeaderString({ payload, secret: "whsec_not_the_real_one" });
  if (how === "garbage") headers["stripe-signature"] = "t=1,v1=deadbeef";
  if (how === "tampered") headers["stripe-signature"] = stripe.webhooks.generateTestHeaderString({ payload: payload + " ", secret: webhookSecret! });
  return await request.post(WEBHOOK_PATH, { data: payload, headers });
}

const service = serviceClient();

export async function subscriptionRow(ownerId: string) {
  const { data, error } = await service.from("subscriptions").select("*").eq("owner_id", ownerId).single();
  if (error) throw new Error(`subscription read failed: ${error.code}`);
  return data;
}

/** A Stripe test customer with the test card pm_card_visa as the default payment method. */
export async function createPayingCustomer(stripe: Stripe, label: string): Promise<string> {
  const customer = await stripe.customers.create({ description: `slotmate-test ${label}`, metadata: { slotmate_test: "1" } });
  const method = await stripe.paymentMethods.attach("pm_card_visa", { customer: customer.id });
  await stripe.customers.update(customer.id, { invoice_settings: { default_payment_method: method.id } });
  return customer.id;
}
