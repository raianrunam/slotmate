// Friendly words for the booking actions. Pure (no server imports) so it can be unit tested.
// Raw database text is never returned or shown: only one of these fixed sentences.
// The error names come from docs/DATABASE.md 7.7 (invalid_status_change) and Postgres codes.

export interface DbError {
  code?: string | null;
  message?: string | null;
}

export const FRIENDLY = {
  changed: "This booking was already changed. Reload the page to see its status.",
  locked:
    "This booking is read-only because its resource or workspace is locked after a plan downgrade. A locked booking cannot be changed or deleted on its own. Deleting the locked resource or workspace removes it.",
  notFound: "That booking could not be found. It may have been deleted.",
  generic: "Something went wrong. Please try again.",
} as const;

export type ActionFailure = "changed" | "locked" | "notFound" | "generic";

/** Which fixed sentence a database error stands for. */
export function mapBookingError(error: DbError): ActionFailure {
  const message = (error.message ?? "").trim();
  if (message === "invalid_status_change") return "changed";
  if (error.code === "42501") return "locked";
  return "generic";
}

/**
 * An update or delete that changed NO row was hidden by row level security or did not match.
 * The caller re-reads the booking (with the owner's own session) and passes what it found:
 *  - not visible at all: not found (deleted, or someone else's);
 *  - visible but its resource or workspace is locked: read-only (Q9);
 *  - visible, unlocked, status different from the one the action needs: already changed;
 *  - otherwise: generic.
 */
export function explainNoChange(found: { status: string; locked: boolean } | null, expectedFrom: string | null): ActionFailure {
  if (!found) return "notFound";
  if (found.locked) return "locked";
  if (expectedFrom !== null && found.status !== expectedFrom) return "changed";
  return "generic";
}
