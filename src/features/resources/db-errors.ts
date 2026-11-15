// Turns database errors from resource actions into friendly messages. Pure.
// Raw database text is never returned. Names: docs/DATABASE.md section 4.5 and
// the set_resource_image errors of section 5.4. The one deadlock retry is shared
// with the workspaces feature (withDeadlockRetry).

import type { DbError } from "@/features/workspaces/db-errors";

export type ResourceErrorKind =
  | "limit"
  | "locked"
  | "not_allowed"
  | "invalid_values"
  | "deadlock"
  | "unknown";

export interface MappedResourceError {
  kind: ResourceErrorKind;
  message: string;
}

export const FRIENDLY = {
  limit: "You have reached the resource limit of your plan. Upgrade to Pro to create more resources.",
  locked: "This resource is locked because of your plan limits, so it cannot be changed. You can still delete it.",
  notAllowed:
    "You cannot make this change. The resource may be locked, may not exist, or may belong to someone else.",
  invalidValues: "Some values are not allowed. Check the form and try again.",
  generic: "Something went wrong. Please try again.",
} as const;

export function mapResourceError(error: DbError): MappedResourceError {
  const message = error.message ?? "";
  if (message.includes("resource_limit_reached")) return { kind: "limit", message: FRIENDLY.limit };
  if (message.includes("resource_locked")) return { kind: "locked", message: FRIENDLY.locked };
  if (
    message.includes("not_owner") ||
    message.includes("owner_not_found") ||
    message.includes("resource_not_found") ||
    message.includes("invalid_path") ||
    error.code === "42501" ||
    error.code === "23503"
  ) {
    return { kind: "not_allowed", message: FRIENDLY.notAllowed };
  }
  if (error.code === "23514") return { kind: "invalid_values", message: FRIENDLY.invalidValues };
  if (error.code === "40P01") return { kind: "deadlock", message: FRIENDLY.generic };
  return { kind: "unknown", message: FRIENDLY.generic };
}
