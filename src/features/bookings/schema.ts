import { z } from "zod";

// Input rules for the booking list and the booking actions (BOOK-01 to BOOK-08).
// Pure and shared: no secrets, no server imports, so the unit tests can run it.

export const STATUS_FILTERS = ["all", "pending", "approved", "rejected", "cancelled"] as const;
export type StatusFilter = (typeof STATUS_FILTERS)[number];

/** The longest search text accepted (anything longer is cut, not refused). */
export const SEARCH_MAX = 100;

export const MESSAGES = {
  id: "That booking could not be found.",
} as const;

export const bookingIdSchema = z.uuid(MESSAGES.id);

export type SearchParamValue = string | string[] | undefined;

const first = (value: SearchParamValue): string | undefined => (Array.isArray(value) ? value[0] : value);

export interface ListParams {
  status: StatusFilter;
  /** Trimmed search text, at most SEARCH_MAX characters; "" when there is no search. */
  q: string;
  /** The requested page (1 or more). The query clamps it to the last page. */
  page: number;
}

/** Reads ?status=&q=&page= from the address. Anything unknown becomes the default; nothing throws. */
export function parseListParams(raw: { status?: SearchParamValue; q?: SearchParamValue; page?: SearchParamValue }): ListParams {
  const status = first(raw.status);
  const q = (first(raw.q) ?? "").replace(/\s+/g, " ").trim().slice(0, SEARCH_MAX).trim();
  const page = Number.parseInt(first(raw.page) ?? "1", 10);
  return {
    status: (STATUS_FILTERS as readonly string[]).includes(status ?? "") ? (status as StatusFilter) : "all",
    q,
    page: Number.isFinite(page) && page >= 1 ? Math.min(page, 1_000_000) : 1,
  };
}

/** The address of the list for a set of parameters (page 1 is left out). */
export function listHref(params: { status?: StatusFilter; q?: string; page?: number }): string {
  const search = new URLSearchParams();
  if (params.status && params.status !== "all") search.set("status", params.status);
  if (params.q) search.set("q", params.q);
  if (params.page && params.page > 1) search.set("page", String(params.page));
  const text = search.toString();
  return text ? `/dashboard/bookings?${text}` : "/dashboard/bookings";
}

/**
 * Makes text safe to use inside an ILIKE pattern, so "%" and "_" typed by the owner are
 * letters like any other (the backslash is ILIKE's default escape character).
 */
export function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (c) => "\\" + c);
}

/**
 * One value for a PostgREST filter list such as `or(a.ilike.<value>,b.eq.<value>)`.
 * Wrapped in double quotes (so commas, dots and brackets are plain text), with the quote and
 * the backslash escaped for that quoting.
 */
export function postgrestQuote(value: string): string {
  return '"' + value.replace(/[\\"]/g, (c) => "\\" + c) + '"';
}

/** The ILIKE pattern "contains this text", ready for postgrestQuote. */
export function containsPattern(text: string): string {
  return `%${escapeLike(text)}%`;
}

export type BookingAction = "approve" | "reject" | "cancel";

/** The status each action starts from and ends in (the database trigger allows exactly these three). */
export const TRANSITIONS: Record<BookingAction, { from: "pending" | "approved"; to: "approved" | "rejected" | "cancelled" }> = {
  approve: { from: "pending", to: "approved" },
  reject: { from: "pending", to: "rejected" },
  cancel: { from: "approved", to: "cancelled" },
};
