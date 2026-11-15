import type { FieldErrors } from "@/features/auth/schema";

// What a workspace Server Action returns to its form. Never contains raw
// database text.
export interface WorkspaceFormState {
  status: "idle" | "error";
  message?: string;
  fieldErrors?: FieldErrors;
  /** True when the plan limit stopped the action: the form shows the upgrade prompt. */
  limitReached?: boolean;
}

export const initialWorkspaceState: WorkspaceFormState = { status: "idle" };
