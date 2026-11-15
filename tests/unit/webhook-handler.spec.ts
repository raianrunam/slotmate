import { expect, test } from "@playwright/test";
import Stripe from "stripe";

// Phase 15 review (findings 5, 7, 8, 12): the REAL webhook handler, called directly with a Request.
// No server, database or network is involved: every case here is answered before the admin connection
// exists (missing setting, missing or bad signature, oversized body), which is exactly what we want to pin.
// ("server-only" is switched to its server-side form by playwright.unit.config.ts.)

const SECRET = "whsec_unit_handler_not_real";
const KEY = "sk_test_unit_handler_not_real";
const URL = "http://localhost/api/stripe/webhook";

const payload = JSON.stringify({ id: "evt_unit_1", object: "event", type: "customer.subscription.updated", data: { object: { id: "sub_1" } } });
const signed = (secret = SECRET, body = payload) => new Stripe(KEY).webhooks.generateTestHeaderString({ payload: body, secret });
const post = (body: string, headers: Record<string, string> = {}) => new Request(URL, { method: "POST", body, headers });

// In order and in one worker: the Stripe client is created once, so the "missing key" case must run before any case that creates it.
test.describe.configure({ mode: "serial" });

const saved = { ...process.env };
test.beforeEach(() => {
  process.env.STRIPE_SECRET_KEY = KEY;
  process.env.STRIPE_WEBHOOK_SECRET = SECRET;
  process.env.STRIPE_PRO_PRICE_ID = "price_unit_not_real";
  // The handler logs codes only; keep the test output quiet.
  console.error = () => undefined;
});
test.afterEach(() => {
  for (const name of ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "STRIPE_PRO_PRICE_ID"]) {
    if (saved[name] === undefined) delete process.env[name];
    else process.env[name] = saved[name];
  }
});

const handler = async () => (await import("../../src/features/billing/webhook")).handleStripeWebhook;

test("a missing signing secret answers 500 with a generic body that does not mention the setting", async () => {
  delete process.env.STRIPE_WEBHOOK_SECRET;
  const res = await (await handler())(post(payload, { "stripe-signature": signed() }));
  expect(res.status).toBe(500);
  const text = await res.text();
  expect(JSON.parse(text)).toEqual({ error: "try_again" });
  expect(text).not.toMatch(/STRIPE|secret|environment|configured|Missing/i);
});

test("a missing Stripe key also answers 500 (never accepts the message)", async () => {
  delete process.env.STRIPE_SECRET_KEY;
  const res = await (await handler())(post(payload, { "stripe-signature": signed() }));
  expect(res.status).toBe(500);
  expect(await res.json()).toEqual({ error: "try_again" });
});

test("a bad signature answers 400, and so does a missing one", async () => {
  const run = await handler();
  const wrong = await run(post(payload, { "stripe-signature": signed("whsec_someone_else") }));
  expect(wrong.status).toBe(400);
  expect(await wrong.json()).toEqual({ error: "invalid_signature" });
  const garbage = await run(post(payload, { "stripe-signature": "t=1,v1=deadbeef" }));
  expect(garbage.status).toBe(400);
  const tampered = await run(post(payload + " ", { "stripe-signature": signed() }));
  expect(tampered.status, "body changed after signing").toBe(400);
  const old = await run(post(payload, { "stripe-signature": new Stripe(KEY).webhooks.generateTestHeaderString({ payload, secret: SECRET, timestamp: Math.floor(Date.now() / 1000) - 3600 }) }));
  expect(old.status, "an old message replayed").toBe(400);
  const none = await run(post(payload));
  expect(none.status).toBe(400);
});

test("an oversized body is refused (413) before it is read", async () => {
  const run = await handler();
  const big = "x".repeat(1_200_000);
  const res = await run(post(big, { "stripe-signature": signed(SECRET, big), "content-length": String(big.length) }));
  expect(res.status).toBe(413);
});

test("a missing setting is told apart from a bad request by type (ConfigError), not by wording", async () => {
  const { ConfigError, getWebhookSecret } = await import("../../src/lib/stripe/client");
  delete process.env.STRIPE_WEBHOOK_SECRET;
  expect(() => getWebhookSecret()).toThrow(ConfigError);
  try {
    getWebhookSecret();
  } catch (error) {
    expect(error).toBeInstanceOf(ConfigError);
    expect((error as Error).message, "names only, never values").toContain("STRIPE_WEBHOOK_SECRET");
  }
});
