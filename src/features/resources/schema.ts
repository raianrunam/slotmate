import { z } from "zod";

// Input rules for the resource forms (RES-04, RES-07, RES-08). Pure and shared.
// The numbers match the CHECK constraints in docs/DATABASE.md section 3.5.

export const NAME_MAX = 100;
export const DESCRIPTION_MAX = 1000;
export const SLOT_MIN = 5;
export const SLOT_MAX = 1440;
export const CAPACITY_MIN = 1;
export const CAPACITY_MAX = 1000;

export const MESSAGES = {
  nameMissing: "Enter a name for the resource.",
  nameLong: `Use at most ${NAME_MAX} characters for the name.`,
  descriptionLong: `Use at most ${DESCRIPTION_MAX} characters for the description.`,
  slot: `Enter the slot length as a whole number of minutes, from ${SLOT_MIN} to ${SLOT_MAX}.`,
  capacity: `Enter the capacity as a whole number, from ${CAPACITY_MIN} to ${CAPACITY_MAX}.`,
  workspace: "Choose the workspace this resource belongs to.",
  id: "That resource could not be found.",
} as const;

// A whole number typed as plain digits ("60"). Empty, decimals, negatives,
// exponents and text are all refused.
function wholeNumber(message: string, min: number, max: number) {
  return z
    .string(message)
    .trim()
    .regex(/^\d{1,6}$/, message)
    .transform(Number)
    .refine((n) => n >= min && n <= max, { message });
}

const name = z
  .string(MESSAGES.nameMissing)
  .trim()
  .min(1, MESSAGES.nameMissing)
  .max(NAME_MAX, MESSAGES.nameLong);

const description = z
  .string()
  .trim()
  .max(DESCRIPTION_MAX, MESSAGES.descriptionLong)
  .transform((value) => (value === "" ? null : value));

export const resourceFieldsSchema = z.object({
  name,
  description,
  slotMinutes: wholeNumber(MESSAGES.slot, SLOT_MIN, SLOT_MAX),
  capacity: wholeNumber(MESSAGES.capacity, CAPACITY_MIN, CAPACITY_MAX),
  // An HTML checkbox sends "on" when ticked and nothing when not.
  isAvailable: z.string().optional().transform((v) => v === "on"),
});

export const createResourceSchema = resourceFieldsSchema.extend({
  workspaceId: z.uuid(MESSAGES.workspace),
});

export const resourceIdSchema = z.uuid(MESSAGES.id);

export type ResourceInput = z.output<typeof resourceFieldsSchema>;

/** "60 minutes", "1 minute". */
export function minutesLabel(minutes: number): string {
  return `${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
}
