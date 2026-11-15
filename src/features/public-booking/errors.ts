import type { DbError } from "@/features/workspaces/db-errors";
import type { BookingErrorKind } from "@/features/public-booking/schema";

// Turns database errors from submit_booking into friendly messages (AVAIL-05,
// PUB-06). Pure. The database raises short fixed names (docs/DATABASE.md 7.2);
// raw database text is NEVER shown to a visitor.

export type { DbError };

export const BOOKING_MESSAGES: Record<BookingErrorKind, string> = {
  slot_taken: "Sorry, that time was just taken. Please pick another time.",
  limit_reached: "This workspace is not accepting booking requests right now. Please try again later.",
  not_bookable: "This resource cannot be booked right now.",
  invalid_slot: "That is not a time this resource offers. Please pick one of the times shown.",
  past: "That time has already started. Please pick a later time.",
  too_far: "You can only book up to 90 days ahead.",
  too_many_attendees: "That is more people than this resource allows.",
  rate_limited: "Too many requests. Please try again in a few minutes.",
  invalid_values: "Some of your details are not allowed. Please check the form and try again.",
  unknown: "Something went wrong. Please try again.",
};

const NAMED = [
  "slot_taken",
  "limit_reached",
  "not_bookable",
  "invalid_slot",
  "past",
  "too_far",
  "too_many_attendees",
] as const satisfies readonly BookingErrorKind[];

export function mapBookingError(error: DbError): BookingErrorKind {
  const message = error.message ?? "";
  for (const name of NAMED) {
    if (new RegExp(`\\b${name}\\b`).test(message)) return name;
  }
  // The overlap rule itself, if it ever surfaces without the function's own name.
  if (error.code === "23P01") return "slot_taken";
  if (error.code === "23514") return "invalid_values";
  return "unknown";
}

