// Turns database errors into friendly messages. Pure (no server imports) so it
// can be unit tested. Raw database text is NEVER shown to the owner: the raw
// error is not returned from here at all, only one of these fixed outcomes.
//
// The names come from docs/DATABASE.md section 4.5 (trigger errors) and Postgres
// error codes: 23505 unique violation, 23514 check violation, 42501 permission,
// 40P01 deadlock.

export interface DbError {
  code?: string | null;
  message?: string | null;
}

export type WorkspaceErrorKind =
  | "limit" // plan limit reached: show the upgrade prompt
  | "slug_taken"
  | "time_zone"
  | "not_allowed"
  | "invalid_values"
  | "deadlock"
  | "unknown";

export interface MappedError {
  kind: WorkspaceErrorKind;
  /** A fixed, friendly sentence. Safe to show. */
  message: string;
  /** The form field the message belongs to, when there is one. */
  field?: "slug" | "timeZone";
}

export const FRIENDLY = {
  limit:
    "You have reached the workspace limit of your plan. Upgrade to Pro to create more workspaces.",
  slugTaken: "That address is taken. Try another one.",
  timeZone: "That is not a time zone we know. Choose one from the list.",
  notAllowed:
    "You cannot make this change. The workspace may be locked, may not exist, or may belong to someone else.",
  invalidValues: "Some values are not allowed. Check the form and try again.",
  generic: "Something went wrong. Please try again.",
} as const;

export function mapWorkspaceError(error: DbError): MappedError {
  const message = error.message ?? "";
  if (message.includes("workspace_limit_reached")) {
    return { kind: "limit", message: FRIENDLY.limit };
  }
  if (message.includes("invalid_time_zone")) {
    return { kind: "time_zone", message: FRIENDLY.timeZone, field: "timeZone" };
  }
  if (message.includes("not_owner") || message.includes("owner_not_found") || error.code === "42501") {
    return { kind: "not_allowed", message: FRIENDLY.notAllowed };
  }
  if (error.code === "23505") {
    // The only unique rule an owner can hit on workspaces is the slug.
    return { kind: "slug_taken", message: FRIENDLY.slugTaken, field: "slug" };
  }
  if (error.code === "23514") {
    return { kind: "invalid_values", message: FRIENDLY.invalidValues };
  }
  if (error.code === "40P01") {
    return { kind: "deadlock", message: FRIENDLY.generic };
  }
  return { kind: "unknown", message: FRIENDLY.generic };
}

// Q10 / R2: every write retries ONCE when the database cancelled it because of
// a deadlock (40P01). The cancelled attempt was undone completely, so a second
// try is safe. After that the owner sees the generic message.
export async function withDeadlockRetry<T extends { error: DbError | null }>(
  run: () => PromiseLike<T>,
): Promise<T> {
  const first = await run();
  if (first.error?.code === "40P01") return await run();
  return first;
}
