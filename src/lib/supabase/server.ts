import "server-only";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { getEnv } from "@/lib/env";
import { hardenCookie } from "@/lib/supabase/cookie-options";
import type { Database } from "@/types/database.types";

// A Supabase client for Server Components, Server Actions and Route Handlers.
// It uses only the publishable key; the owner's login cookies decide who is
// asking. The PKCE flow is the default for this client.
export async function createClient() {
  // The Supabase client reads the clock when it starts. Wait for a real request
  // first so it never runs while Next.js is prerendering (Cache Components).
  await connection();
  const env = getEnv();
  const cookieStore = await cookies();
  return createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, hardenCookie(options));
            }
          } catch {
            // Server Components cannot write cookies. The proxy refreshes the
            // session on every dashboard request, so this is safe to ignore.
          }
        },
      },
    },
  );
}
