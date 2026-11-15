import "server-only";
import { createClient } from "@/lib/supabase/server";

// Reads for the availability pages: the owner's own session (RLS), never the
// secret key. Callers must already have passed the owner check.

export interface AvailabilityRow {
  resource_id: string;
  weekday: number;
  opens_at: string;
  closes_at: string;
}

/** The opening hours of one resource (empty when none are set). */
export async function getAvailability(resourceId: string): Promise<AvailabilityRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("resource_availability")
    .select("resource_id, weekday, opens_at, closes_at")
    .eq("resource_id", resourceId)
    .order("weekday");
  if (error) {
    console.error("getAvailability failed", { code: error.code });
    throw new Error("Could not load the opening hours.");
  }
  return data ?? [];
}

/** The opening hours of several resources at once (for the overview list). */
export async function getAvailabilityFor(resourceIds: readonly string[]): Promise<AvailabilityRow[]> {
  if (resourceIds.length === 0) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("resource_availability")
    .select("resource_id, weekday, opens_at, closes_at")
    .in("resource_id", [...resourceIds])
    .order("weekday");
  if (error) {
    console.error("getAvailabilityFor failed", { code: error.code });
    throw new Error("Could not load the opening hours.");
  }
  return data ?? [];
}
