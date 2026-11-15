import "server-only";
import { createHash } from "node:crypto";
import { connection } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEnv } from "@/lib/env";
import {
  addDaysToDate,
  dropOverlappingSlots,
  dropTakenSlots,
  MAX_DAYS_AHEAD,
  slotsForDay,
  todayInZone,
  type AvailabilityWindow,
} from "@/lib/time/slots";
import { DATE, STATUS_CODE, type DaySlotsResult } from "@/features/public-booking/schema";
import { effectiveEmbedOptions, normalizeEmbedOptions, type EmbedOptions } from "@/features/embed/schema";
import type { Database } from "@/types/database.types";

// Server-only reads for the public pages (A4 place 1: "public reads"). They use
// the admin connection, and ONLY these columns, so the HTML never holds owner
// data (no owner id, no email) or other visitors' details (ISO-02, ISO-03):
//  * workspace: name, description, time zone (and the owner id, which stays here
//    to look up the monthly limit and is never returned);
//  * resources that are available and not locked: name, description, image,
//    capacity, slot length;
//  * bookings: only id, resource, start, end and status of the held ranges; for the
//    status page only the booking found by the hash of its secret code.
// Every function waits for a real request first (connection()), so nothing here
// runs while Next.js prerenders, and nothing is cached (A16).

export interface PublicResource {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  capacity: number;
  slotMinutes: number;
}

export interface PublicWorkspace {
  name: string;
  description: string | null;
  timeZone: string;
  resources: PublicResource[];
  /** False when the owner's monthly limit is reached (D19, PUB-06): the page shows no form. */
  acceptingRequests: boolean;
  /** Only when asked for (the widget): the options that really apply, Pro values already dropped for a non-Pro owner (EMBED-05). */
  embed?: EmbedOptions;
}

/** The public address of a stored image (the bucket is public, S1). */
function imageUrl(path: string | null): string | null {
  if (!path) return null;
  const base = getEnv().NEXT_PUBLIC_SUPABASE_URL.replace(/\/+$/, "");
  return `${base}/storage/v1/object/public/resource-images/${path.split("/").map(encodeURIComponent).join("/")}`;
}

function firstOfUtcMonth(now: Date): string {
  return `${now.toISOString().slice(0, 7)}-01`;
}

/** PUB-01, PUB-02, BILL-09: null when the slug is unknown or the workspace is locked. */
export async function getPublicWorkspace(slug: string, options: { embed?: boolean } = {}): Promise<PublicWorkspace | null> {
  await connection();
  const admin = createAdminClient();

  const workspace = await admin
    .from("workspaces")
    .select("id, owner_id, name, description, time_zone, is_locked")
    .eq("slug", slug)
    .maybeSingle();
  if (workspace.error) {
    console.error("getPublicWorkspace failed", { code: workspace.error.code });
    throw new Error("Could not load this page.");
  }
  if (!workspace.data || workspace.data.is_locked) return null;
  const { id, owner_id: ownerId } = workspace.data;

  const resources = await admin
    .from("resources")
    .select("id, name, description, image_path, capacity, slot_minutes")
    .eq("workspace_id", id)
    .eq("is_available", true)
    .eq("is_locked", false)
    .order("name", { ascending: true })
    .order("id", { ascending: true });
  if (resources.error) {
    console.error("getPublicWorkspace resources failed", { code: resources.error.code });
    throw new Error("Could not load this page.");
  }

  // D19: the month's count against the plan's limit. The database re-checks inside submit_booking.
  let acceptingRequests = true;
  let ownerPlan: "free" | "pro" = "free";
  if ((resources.data ?? []).length > 0 || options.embed) {
    const plan = await admin.rpc("current_plan", { p_owner_id: ownerId });
    if (plan.error || !plan.data) {
      console.error("current_plan failed", { code: plan.error?.code ?? null });
      throw new Error("Could not load this page.");
    }
    ownerPlan = plan.data === "pro" ? "pro" : "free";
  }
  if ((resources.data ?? []).length > 0) {
    const [limit, usage] = await Promise.all([
      admin.from("plan_limits").select("max_monthly_bookings").eq("plan", ownerPlan).maybeSingle(),
      admin.from("monthly_usage").select("booking_count").eq("owner_id", ownerId).eq("month", firstOfUtcMonth(new Date())).maybeSingle(),
    ]);
    if (limit.error || usage.error || !limit.data) {
      console.error("monthly limit lookup failed", { code: (limit.error ?? usage.error)?.code ?? null });
      throw new Error("Could not load this page.");
    }
    acceptingRequests = (usage.data?.booking_count ?? 0) < limit.data.max_monthly_bookings;
  }

  // The widget's options (EMBED-03 to EMBED-05): only theme, layout and colour are read, and
  // what the owner's plan does not allow is dropped here, before the page ever sees it.
  let embed: EmbedOptions | undefined;
  if (options.embed) {
    const config = await admin
      .from("embed_configurations")
      .select("theme, layout, background_color")
      .eq("workspace_id", id)
      .maybeSingle();
    if (config.error) {
      console.error("embed options lookup failed", { code: config.error.code });
      throw new Error("Could not load this page.");
    }
    embed = effectiveEmbedOptions(normalizeEmbedOptions(config.data), ownerPlan);
  }

  return {
    name: workspace.data.name,
    description: workspace.data.description,
    timeZone: workspace.data.time_zone,
    acceptingRequests,
    ...(embed ? { embed } : {}),
    resources: (resources.data ?? []).map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      imageUrl: imageUrl(r.image_path),
      capacity: r.capacity,
      slotMinutes: r.slot_minutes,
    })),
  };
}

/**
 * PUB-03, PUB-05, AVAIL-03: the free slots of ONE day (never the whole 90 days,
 * Phase 10 finding 16): the slots the rules offer, minus the ranges held by a
 * pending or approved booking, minus a slot that overlaps an earlier offered one
 * (finding 26). The visitor sees no information about who booked what.
 */
export async function getDaySlots(resourceId: string, date: string, now: Date = new Date()): Promise<DaySlotsResult> {
  await connection();
  if (!DATE.test(date)) return { ok: false };
  const admin = createAdminClient();

  const resource = await admin
    .from("resources")
    .select("id, slot_minutes, is_available, is_locked, workspaces(time_zone, is_locked), resource_availability(weekday, opens_at, closes_at)")
    .eq("id", resourceId)
    .maybeSingle();
  if (resource.error) {
    console.error("getDaySlots failed", { code: resource.error.code });
    return { ok: false };
  }
  const r = resource.data;
  if (!r || !r.is_available || r.is_locked || !r.workspaces || r.workspaces.is_locked) return { ok: false };

  const timeZone = r.workspaces.time_zone;
  const today = todayInZone(timeZone, now);
  if (date < today || date > addDaysToDate(today, MAX_DAYS_AHEAD)) return { ok: true, slots: [] };

  const windows: AvailabilityWindow[] = (r.resource_availability ?? []).map((w) => ({
    weekday: w.weekday,
    opensAt: w.opens_at,
    closesAt: w.closes_at,
  }));
  const offered = dropOverlappingSlots(slotsForDay({ slotMinutes: r.slot_minutes, windows, timeZone, date, now }));
  if (offered.length === 0) return { ok: true, slots: [] };

  // Held ranges around this day (a 3-day window is more than any zone offset can need). Only
  // id, resource, start, end and status are read: nothing about the visitor (ISO-03).
  const dayStart = Date.parse(`${date}T00:00:00Z`);
  const held = await admin
    .from("bookings")
    .select("id, resource_id, starts_at, ends_at, status")
    .eq("resource_id", resourceId)
    .in("status", ["pending", "approved"])
    .lt("starts_at", new Date(dayStart + 48 * 3_600_000).toISOString())
    .gt("ends_at", new Date(dayStart - 24 * 3_600_000).toISOString());
  if (held.error) {
    console.error("getDaySlots held ranges failed", { code: held.error.code });
    return { ok: false };
  }

  const free = dropTakenSlots(
    offered,
    (held.data ?? []).map((b) => ({ startsAt: new Date(b.starts_at), endsAt: new Date(b.ends_at) })),
  );
  return { ok: true, slots: free.map((s) => ({ startsAt: s.startsAt.toISOString(), start: s.start, end: s.end })) };
}

export interface BookingStatusView {
  status: Database["public"]["Enums"]["booking_status"];
  startsAt: string;
  endsAt: string;
  visitorName: string;
  resourceName: string;
  workspaceName: string;
  workspaceSlug: string;
  timeZone: string;
}

/** SHA-256 of the status code, in PostgREST's bytea text form (A8). */
export function hashStatusCode(code: string): string {
  return `\\x${createHash("sha256").update(code).digest("hex")}`;
}

/**
 * NOTIF-03: the booking whose secret code this is. Only the resource, the time,
 * the visitor's own NAME, the status and the workspace are returned; never the
 * email, phone or note (ISO-03). null for a wrong code or a deleted booking.
 */
export async function getBookingStatus(code: string): Promise<BookingStatusView | null> {
  await connection();
  if (!STATUS_CODE.test(code)) return null;
  const admin = createAdminClient();
  const found = await admin
    .from("bookings")
    .select("status, starts_at, ends_at, visitor_name, resources(name, workspaces(name, slug, time_zone))")
    .eq("status_token_hash", hashStatusCode(code))
    .maybeSingle();
  if (found.error) {
    console.error("getBookingStatus failed", { code: found.error.code });
    throw new Error("Could not load this page.");
  }
  const b = found.data;
  if (!b || !b.resources || !b.resources.workspaces) return null;
  return {
    status: b.status,
    startsAt: b.starts_at,
    endsAt: b.ends_at,
    visitorName: b.visitor_name,
    resourceName: b.resources.name,
    workspaceName: b.resources.workspaces.name,
    workspaceSlug: b.resources.workspaces.slug,
    timeZone: b.resources.workspaces.time_zone,
  };
}
