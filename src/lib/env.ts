import { z } from "zod";

// The environment variables the app needs. Only NEXT_PUBLIC_* names are listed:
// they are meant to be visible to the browser, so this file holds no secret and
// may be imported anywhere (including the proxy). The secret key is NOT read
// by anything under src/ in Phase 7.
const schema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  NEXT_PUBLIC_APP_URL: z.url(),
});

export type AppEnv = z.infer<typeof schema>;

// Fails loudly with the variable NAME only, never its value.
export function getEnv(): AppEnv {
  // The names must be written out in full so Next.js can find them.
  const result = schema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  });
  if (!result.success) {
    const names = [...new Set(result.error.issues.map((i) => String(i.path[0])))];
    throw new Error(
      `Missing or invalid environment variable(s): ${names.join(", ")}. Check .env.local (see .env.example).`,
    );
  }
  return {
    ...result.data,
    NEXT_PUBLIC_APP_URL: result.data.NEXT_PUBLIC_APP_URL.replace(/\/+$/, ""),
  };
}
