import { expect, test } from "@playwright/test";
import { serviceClient } from "../db/helpers";
import { LOGGED_OUT } from "./owner";
import { guardStripeVars } from "./stripe-helpers";
import { addResource, addWorkspace, cleanupOwners, forgeOnSubmit, logIn, newOwner, setPlan, tag } from "./owners";

// Phase 15 UI: the billing page for Free and Pro owners, the upgrade button reaching Stripe Checkout
// (nothing is paid), the return from Checkout, and the downgrade selection screen with a forged choice.
// Pro state is set the way the webhook sets it (service_role); the real webhook is tested in billing-webhook.spec.ts.

test.use({ storageState: LOGGED_OUT });
test.afterAll(cleanupOwners);

const service = serviceClient();
// Fails (not skips) when CI is set and a Stripe variable is missing; skipped on a machine without them.
const stripeMissing = guardStripeVars(["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "STRIPE_PRO_PRICE_ID"]);
const stripeConfigured = stripeMissing.length === 0;

test("a Free owner sees the Free plan, real usage, the upgrade button and no manage button", async ({ page }) => {
  const owner = await newOwner();
  const ws = await addWorkspace(owner, `Bill ${tag()}`);
  await addResource(owner, ws, "One");
  await addResource(owner, ws, "Two");
  await logIn(page, owner);
  await page.goto("/dashboard/billing");

  await expect(page.getByTestId("current-plan")).toHaveText("Free");
  await expect(page.getByTestId("upgrade-button")).toBeVisible();
  await expect(page.getByRole("button", { name: "Manage subscription" })).toHaveCount(0);
  await expect(page.getByText("1 of 1", { exact: true })).toBeVisible();
  await expect(page.getByText("2 of 3", { exact: true })).toBeVisible();
  await expect(page.getByText("0 of 100", { exact: true })).toBeVisible();
  await expect(page.getByTestId("downgrade-banner")).toHaveCount(0);
  await expect(page.getByText("Placeholder")).toHaveCount(0);
});

test("a Pro owner sees Pro, the renewal date and Manage subscription, and no upgrade button", async ({ page }) => {
  const owner = await newOwner();
  await setPlan(owner.id, "pro");
  const end = new Date(Date.UTC(2031, 0, 15)).toISOString();
  const res = await service
    .from("subscriptions")
    .update({ stripe_customer_id: `cus_test_${tag()}${tag()}`, current_period_end: end })
    .eq("owner_id", owner.id);
  expect(res.error).toBeNull();
  await logIn(page, owner);
  await page.goto("/dashboard/billing");

  await expect(page.getByTestId("current-plan")).toHaveText("Pro");
  await expect(page.getByTestId("plan-status")).toHaveText("active");
  await expect(page.getByTestId("plan-line")).toHaveText("Renews on January 15, 2031.");
  await expect(page.getByRole("button", { name: "Manage subscription" }).first()).toBeVisible();
  await expect(page.getByTestId("upgrade-button")).toHaveCount(0);
  await expect(page.getByText("0 of 5", { exact: true })).toBeVisible();
  await expect(page.getByText("0 of 1,000", { exact: true }).or(page.getByText("0 of 1000", { exact: true }))).toBeVisible();

  // Cancelling at the period end keeps Pro until that date.
  await service.from("subscriptions").update({ cancel_at_period_end: true }).eq("owner_id", owner.id);
  await page.reload();
  await expect(page.getByTestId("current-plan")).toHaveText("Pro");
  await expect(page.getByTestId("plan-line")).toHaveText("Pro until January 15, 2031. It will not renew.");
});

test("coming back from Checkout changes nothing by itself: still Free, with a confirming message or a cancelled message", async ({ page }) => {
  const owner = await newOwner();
  await logIn(page, owner);
  await page.goto("/dashboard/billing?checkout=success");
  await expect(page.getByTestId("confirming-payment")).toBeVisible();
  await expect(page.getByTestId("current-plan")).toHaveText("Free");
  expect((await service.from("subscriptions").select("plan").eq("owner_id", owner.id).single()).data?.plan).toBe("free");

  await page.goto("/dashboard/billing?checkout=cancelled");
  await expect(page.getByTestId("checkout-cancelled")).toBeVisible();
  await expect(page.getByTestId("current-plan")).toHaveText("Free");
});

test("the Upgrade button sends the owner to Stripe Checkout (nothing is paid)", async ({ page }) => {
  test.skip(!stripeConfigured, "Stripe variables missing in .env.local (see ARCHITECTURE section 7)");
  const owner = await newOwner();
  await logIn(page, owner);
  await page.goto("/dashboard/billing");
  await page.getByTestId("upgrade-button").click();
  await page.waitForURL(/^https:\/\/checkout\.stripe\.com\//, { timeout: 45_000 });
  expect(new URL(page.url()).hostname).toBe("checkout.stripe.com");
  // The plan is still Free: only a verified webhook can change it.
  expect((await service.from("subscriptions").select("plan").eq("owner_id", owner.id).single()).data?.plan).toBe("free");
});

test("the webhook address answers only POST and refuses an empty request", async ({ request }) => {
  expect((await request.get("/api/stripe/webhook")).status()).toBe(405);
  const res = await request.post("/api/stripe/webhook", { data: "{}", headers: { "content-type": "application/json" } });
  expect(res.status()).toBe(400);
});

test("a signed-out visitor cannot open the billing or selection pages", async ({ page }) => {
  for (const path of ["/dashboard/billing", "/dashboard/billing/downgrade"]) {
    await page.goto(path);
    await page.waitForURL(/\/login/);
  }
});

test("selection screen: nothing to choose within the limits; with a forged choice the server refuses and nothing is unlocked", async ({ page }) => {
  const owner = await newOwner();
  await logIn(page, owner);
  await page.goto("/dashboard/billing/downgrade");
  await expect(page.getByTestId("selection-not-needed")).toBeVisible();

  // Pro -> two workspaces with resources -> Free again: everything locked.
  await setPlan(owner.id, "pro");
  const a = await addWorkspace(owner, `Keep ${tag()}`);
  const b = await addWorkspace(owner, `Other ${tag()}`);
  await addResource(owner, a, "Alpha");
  const beta = await addResource(owner, b, "Beta");
  await setPlan(owner.id, "free");
  const locked = await owner.client.from("workspaces").select("is_locked");
  expect((locked.data ?? []).every((w) => w.is_locked)).toBe(true);

  await page.goto("/dashboard/billing/downgrade");
  await expect(page.getByTestId("downgrade-banner")).toBeVisible();

  // Submitting without a workspace is refused (the button stays disabled in the browser; the server says so too).
  await expect(page.getByRole("button", { name: "Keep this selection" })).toBeDisabled();

  // A forged request: workspace A chosen, but the resource is another workspace's (DB17).
  const aName = (await owner.client.from("workspaces").select("name").eq("id", a).single()).data!.name;
  await page.getByRole("radio", { name: aName }).check();
  await page.getByRole("checkbox", { name: "Alpha" }).check();
  await forgeOnSubmit(page, "form", { resourceIds: beta });
  await page.getByRole("button", { name: "Keep this selection" }).click();
  await expect(page.getByTestId("selection-error")).toContainText("not allowed");
  const after = await owner.client.from("workspaces").select("is_locked");
  expect((after.data ?? []).every((w) => w.is_locked), "nothing was unlocked").toBe(true);
  const resources = await owner.client.from("resources").select("is_locked");
  expect((resources.data ?? []).every((r) => r.is_locked)).toBe(true);
});

// These need only the secret key and the signing secret (no Pro price): real signatures, real Stripe lookups.
test.describe("webhook with real signatures", () => {
  const key = process.env.STRIPE_SECRET_KEY;
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  test.skip(!key || !secret, "STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET missing in .env.local");

  const body = (id: string, type: string, object: Record<string, unknown>) =>
    JSON.stringify({ id, object: "event", type, created: Math.floor(Date.now() / 1000), data: { object } });

  test("wrong or missing signatures are refused with 400 before anything else", async ({ request }) => {
    const { default: Stripe } = await import("stripe");
    const stripe = new Stripe(key!);
    const payload = body(`evt_test_${tag()}${tag()}`, "customer.subscription.updated", { id: "sub_x", customer: "cus_x" });
    const headers = { "content-type": "application/json" };
    expect((await request.post("/api/stripe/webhook", { data: payload, headers })).status()).toBe(400);
    const wrong = stripe.webhooks.generateTestHeaderString({ payload, secret: "whsec_not_the_real_one" });
    expect((await request.post("/api/stripe/webhook", { data: payload, headers: { ...headers, "stripe-signature": wrong } })).status()).toBe(400);
    const signed = stripe.webhooks.generateTestHeaderString({ payload, secret: secret! });
    expect((await request.post("/api/stripe/webhook", { data: payload + " ", headers: { ...headers, "stripe-signature": signed } })).status(), "body changed after signing").toBe(400);
    const stale = stripe.webhooks.generateTestHeaderString({ payload, secret: secret!, timestamp: Math.floor(Date.now() / 1000) - 3600 });
    expect((await request.post("/api/stripe/webhook", { data: payload, headers: { ...headers, "stripe-signature": stale } })).status(), "an old message replayed").toBe(400);
  });

  test("a correctly signed message about a subscription that is not ours changes nothing and is handled once", async ({ request }) => {
    test.skip(!stripeConfigured, "STRIPE_PRO_PRICE_ID is needed: the webhook compares the price");
    const { default: Stripe } = await import("stripe");
    const stripe = new Stripe(key!);
    const owner = await newOwner();
    const before = (await service.from("subscriptions").select("*").eq("owner_id", owner.id).single()).data;
    const payload = body(`evt_test_${tag()}${tag()}`, "customer.subscription.updated", { id: `sub_nope_${tag()}`, customer: `cus_nope_${tag()}`, status: "active" });
    const headers = { "content-type": "application/json", "stripe-signature": stripe.webhooks.generateTestHeaderString({ payload, secret: secret! }) };
    const first = await request.post("/api/stripe/webhook", { data: payload, headers });
    expect(first.status()).toBe(200);
    const again = await request.post("/api/stripe/webhook", { data: payload, headers });
    expect(again.status()).toBe(200);
    expect((await again.json()).duplicate).toBe(true);
    const after = (await service.from("subscriptions").select("*").eq("owner_id", owner.id).single()).data;
    expect(after).toEqual(before);
  });
});

test("an oversized message is refused (413) before it is read", async ({ request }) => {
  const res = await request.post("/api/stripe/webhook", {
    data: "x".repeat(1_200_000),
    headers: { "content-type": "application/json", "stripe-signature": "t=1,v1=00" },
  });
  expect(res.status()).toBe(413);
});
