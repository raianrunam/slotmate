import type { EmbedFieldErrors } from "@/features/embed/schema";

// What the widget Server Action returns to its form. Never contains raw database text.
export interface WidgetFormState {
  status: "idle" | "saved" | "error";
  message?: string;
  fieldErrors?: EmbedFieldErrors;
  /** True when the plan stopped the save: the form shows the upgrade prompt. */
  proOnly?: boolean;
}

export const initialWidgetState: WidgetFormState = { status: "idle" };
