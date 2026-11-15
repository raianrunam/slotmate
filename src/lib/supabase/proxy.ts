import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { getEnv } from "@/lib/env";
import { hardenCookie } from "@/lib/supabase/cookie-options";

// Used only by src/proxy.ts. It cannot import "server-only" (the proxy is not
// a React server environment); it holds no secret and uses the publishable key.
//
// It reads the login cookies from the request, refreshes the tokens when they
// expired (Supabase requires this) and writes the refreshed cookies onto the
// response. getClaims() checks the token signature without a database call, so
// this is only an OPTIMISTIC check. requireOwner() does the real check.
//
// verify: true asks Supabase Auth to confirm the user (a network call). It is
// used on /login and similar pages so a token that is still validly signed but
// belongs to a deleted or revoked account cannot cause a redirect loop with
// requireOwner().
export async function readSession(request: NextRequest, verify = false) {
  const env = getEnv();
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, hardenCookie(options));
          }
          // Supabase asks for no-cache headers on responses that carry session
          // cookies, so no shared cache stores them (review finding 7).
          for (const [key, value] of Object.entries(headers)) {
            response.headers.set(key, value);
          }
        },
      },
    },
  );

  let signedIn = false;
  try {
    if (verify) {
      const { data } = await supabase.auth.getUser();
      signedIn = Boolean(data?.user);
    } else {
      const { data } = await supabase.auth.getClaims();
      signedIn = Boolean(data?.claims?.sub);
    }
  } catch {
    signedIn = false;
  }
  return { signedIn, getResponse: () => response };
}
