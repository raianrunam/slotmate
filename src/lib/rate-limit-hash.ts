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
  return first && first.length <= 100 ? normaliseAddress(first) : LOCAL_ADDRESS;
}

const MAPPED_IPV4 = /^(?:0{1,4}:){0,5}:?ffff:(\d{1,3}(?:\.\d{1,3}){3})$/;
const MAPPED_IPV4_SHORT = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/;

/**
 * One visitor, one key (Phase 11 review finding 3). A home line or a server gets a whole IPv6
 * block (a /64) and can send each request from a different address inside it, so for IPv6 the
 * key is the FIRST 64 BITS. An IPv4-mapped address (::ffff:1.2.3.4) is the same visitor as the
 * plain IPv4 one. Different spellings of one address give the same key. Anything not recognised
 * is kept as typed (lowercased).
 */
export function normaliseAddress(address: string): string {
  const a = address.trim().toLowerCase().replace(/^\[/, "").replace(/\]$/, "").replace(/%.*$/, "");
  const mapped = MAPPED_IPV4_SHORT.exec(a) ?? MAPPED_IPV4.exec(a);
  if (mapped) return mapped[1];
  if (!a.includes(":")) return a; // IPv4, or something else we keep as it is
  const halves = a.split("::");
  if (halves.length > 2) return a;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const groups = halves.length === 2 ? [...head, ...Array<string>(Math.max(0, 8 - head.length - tail.length)).fill("0"), ...tail] : head;
  if (groups.length !== 8 || !groups.every((g) => /^[0-9a-f]{1,4}$/.test(g))) return a;
  return `${groups.slice(0, 4).map((g) => g.padStart(4, "0")).join(":")}::/64`;
}

/** HMAC-SHA256(secret, address) in PostgREST's bytea text form ("\x" + 64 hex characters). */
export function keyedHash(secret: string, address: string): string {
  return `\\x${createHmac("sha256", secret).update(address).digest("hex")}`;
}
