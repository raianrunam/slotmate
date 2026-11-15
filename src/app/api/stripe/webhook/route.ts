import { handleStripeWebhook } from "@/features/billing/webhook";

// The Stripe webhook address (ARCHITECTURE A2). Stripe's servers call it, not a
// browser, so there is no login here: the signed message IS the credential
// (checked first thing in handleStripeWebhook). Only POST exists. A POST handler
// is never cached and runs on the Node.js runtime, so no route segment settings are
// needed (and this project's cacheComponents setting does not allow them).
export async function POST(request: Request) {
  return await handleStripeWebhook(request);
}
