import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

// THE admin connection (the secret key, role service_role). It skips RLS, so it
// is used in as few places as possible (ARCHITECTURE A4). Its importers are exactly:
//  * src/features/resources/images.ts (resource image Storage, S1, "place 5", and the
//    clean-up before deletes, DB15);
//  * src/features/public-booking/queries.ts (public reads, "place 1");
//  * src/features/public-booking/actions.ts (booking submission and the rate limit,
//    "places 2 and 3").
// A unit test fails if any other file imports this module.
//
// Never import this from a "use client" file, never pass the client or the key
// to the browser, never log the key.
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    // Names only, never values.
    throw new Error("Missing environment variable(s) for the admin connection: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY.");
  }
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
