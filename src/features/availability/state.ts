// What the availability Server Action returns to its form. Never contains raw
// database text. Errors are keyed by form field name (for example "closes-3").
export interface AvailabilityFormState {
  status: "idle" | "error" | "success";
  message?: string;
  fieldErrors?: Record<string, string>;
}

export const initialAvailabilityState: AvailabilityFormState = { status: "idle" };
