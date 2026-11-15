import { createHmac } from "node:crypto";

// The pure parts of the rate limit (SEC-06, D24, A9, DB11), kept apart from
// src/lib/rate-limit.ts so they can be unit tested. No environment access here:
// the secret is passed in.

// Used when the platform sends no address (your own computer, or a direct request
// in a test): all such requests share ONE allowance per workspace.
export const LOCAL_ADDRESS = "local";

/**
 * The visitor's address: the FIRST value of x-forwarded-for. On Vercel the platform
 * sets this header itself and a visitor cannot overwrite it; behind a proxy that
 * does not do that, the header could be forged (ARCHITECTURE section 10, to be
 * confirmed on the deployed site). Missing or unreasonable values use LOCAL_ADDRESS.
 */
export function clientAddress(headers: Pick<Headers, "get">): string {
  const first = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return first && first.length <= 100 ? first.toLowerCase() : LOCAL_ADDRESS;
}

/** HMAC-SHA256(secret, address) in PostgREST's bytea text form ("\x" + 64 hex characters). */
export function keyedHash(secret: string, address: string): string {
  return `\\x${createHmac("sha256", secret).update(address).digest("hex")}`;
}
