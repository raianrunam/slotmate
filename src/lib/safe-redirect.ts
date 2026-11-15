// Open-redirect protection for the "?next=" address used after logging in.
// A pure function with no imports, so the proxy, the Server Actions and the
// unit tests can all use it.
//
// Only a same-site path under /dashboard is accepted. The check is an
// allow-list on the RAW text: letters, digits and . _ ~ - / in the path, and
// = & . _ ~ - in an optional query. A percent sign, backslash, colon, "@",
// control character, space, "//" or ".." is never allowed, so encoded tricks
// such as %2F%2Fevil.com are refused without needing to decode them.
// Anything else becomes "/dashboard".
export const DEFAULT_AFTER_LOGIN = "/dashboard";

const MAX_LENGTH = 200;
const ALLOWED = /^\/dashboard(?:\/[A-Za-z0-9._~\-/]*)?(?:\?[A-Za-z0-9=&._~-]*)?$/;

export function safeNext(value: unknown): string {
  if (typeof value !== "string") return DEFAULT_AFTER_LOGIN;
  if (value.length === 0 || value.length > MAX_LENGTH) return DEFAULT_AFTER_LOGIN;
  if (!ALLOWED.test(value)) return DEFAULT_AFTER_LOGIN;
  const path = value.split("?")[0];
  if (path.includes("//") || path.includes("..")) return DEFAULT_AFTER_LOGIN;
  return value;
}
