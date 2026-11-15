import type { FieldErrors } from "@/features/auth/schema";

// What an auth Server Action returns to its form. Never contains a password.
export interface FormState {
  status: "idle" | "error" | "success";
  message?: string;
  fieldErrors?: FieldErrors;
  // Given back so the email box keeps what the visitor typed.
  email?: string;
}

export const initialFormState: FormState = { status: "idle" };
