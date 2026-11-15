import type { CookieOptions } from "@supabase/ssr";

// The login cookies are set by our server only (AUTH-05): hidden from page
// scripts (httpOnly), not sent on cross-site POSTs (sameSite lax) and
// HTTPS-only in production. No browser Supabase client exists (A1), so
// nothing in the browser needs to read them.
export function hardenCookie(options: CookieOptions | undefined): CookieOptions {
  return {
    ...options,
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
  };
}
