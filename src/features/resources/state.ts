import type { FieldErrors } from "@/features/auth/schema";

// What a resource Server Action returns to its form. Never contains raw
// database text.
export interface ResourceFormState {
  status: "idle" | "error" | "success";
  message?: string;
  fieldErrors?: FieldErrors;
  /** True when the plan limit stopped the action: the form shows the upgrade prompt. */
  limitReached?: boolean;
}

export const initialResourceState: ResourceFormState = { status: "idle" };
