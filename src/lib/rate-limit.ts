import "server-only";
import { clientAddress, keyedHash } from "@/lib/rate-limit-hash";

// The public form's rate limit, server side (SEC-06, D24, A9, DB11; ARCHITECTURE 6.3).
//
//  * The visitor's internet address is read from the platform's header and turned
//    into a keyed hash (HMAC-SHA256 with RATE_LIMIT_SECRET) right here, in Node.
//    The database (check_rate_limit) only ever sees the hash. The address itself
//    is never stored, never logged and never put in an error message.
//  * The counting (5 attempts per 10 minutes per visitor per workspace) is done by
//    the database function check_rate_limit, so this file holds no counters.
//  * This file does not import the admin connection: the caller passes in the
//    function that talks to the database.

/** A short secret plus a leaked table would allow guessing internet addresses (Phase 16 LOW-1). */
export const MIN_SECRET_LENGTH = 32;

export type RateLimitCheck = (
  workspaceId: string,
  ipHash: string,
) => PromiseLike<{ data: boolean | null; error: { code?: string | null } | null }>;

/** "allowed", "refused", or "failed" (the check itself broke: the caller must NOT accept the booking). */
export async function checkRate(
  check: RateLimitCheck,
  workspaceId: string,
  headers: Pick<Headers, "get">,
): Promise<"allowed" | "refused" | "failed"> {
  const secret = process.env.RATE_LIMIT_SECRET;
  if (!secret || secret.length < MIN_SECRET_LENGTH) {
    console.error(secret ? "RATE_LIMIT_SECRET is too short" : "RATE_LIMIT_SECRET is not set"); // the name only, never the value
    return "failed";
  }
  const result = await check(workspaceId, keyedHash(secret, clientAddress(headers)));
  if (result.error) {
    console.error("check_rate_limit failed", { code: result.error.code ?? null });
    return "failed";
  }
  return result.data === true ? "allowed" : "refused";
}
