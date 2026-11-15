import "server-only";
import Stripe from "stripe";

// The ONLY place that reads the three Stripe variables (ARCHITECTURE section 7).
// Test-mode keys only. Names only in error messages, never values. Never import
// this from browser code.

/** A missing server setting (our fault), told apart from a bad request by type, not by wording. */
export class ConfigError extends Error {
  constructor(name: string) {
    super(`Missing environment variable: ${name}.`);
    this.name = "ConfigError";
  }
}

function need(name: string): string {
  const value = process.env[name];
  if (!value) throw new ConfigError(name);
  return value;
}

let client: Stripe | null = null;

/** The Stripe API client (secret key). One try again after a network failure; a hung call gives up after 15 s. */
export function getStripe(): Stripe {
  client ??= new Stripe(need("STRIPE_SECRET_KEY"), { timeout: 15_000, maxNetworkRetries: 1 });
  return client;
}

/** The signing secret used to verify webhook messages (SEC-04). */
export function getWebhookSecret(): string {
  return need("STRIPE_WEBHOOK_SECRET");
}

/** Which Stripe price is the Pro plan. */
export function getProPriceId(): string {
  return need("STRIPE_PRO_PRICE_ID");
}

/** How far a signed message's time may differ from ours before it is treated as a replay (seconds). */
export const SIGNATURE_TOLERANCE_SECONDS = 300;
