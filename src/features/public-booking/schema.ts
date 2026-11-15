import { z } from "zod";

// Input rules for the public booking form (PUB-04, SEC-02, D11). Pure and shared:
// the browser runs them for instant messages, the Server Action runs them again
// (the check that counts). The limits match the database CHECKs on `bookings`
// (docs/DATABASE.md 3.7): name 1 to 100 characters, email 3 to 254 with an "@",
// phone at most 30, note at most 1000, attendees at least 1 (the upper bound is
// the resource's capacity).

export const LIMITS = { name: 100, email: 254, phone: 30, note: 1000 } as const;

export const MESSAGES = {
  resource: "Choose a resource first.",
  startsAt: "Choose a time first.",
  name: `Enter your name (up to ${LIMITS.name} characters).`,
  email: "Enter a valid email address.",
  phone: `Enter a phone number using digits, spaces and + ( ) - . only (up to ${LIMITS.phone} characters).`,
  note: `Keep the note to ${LIMITS.note} characters or fewer.`,
} as const;

export const attendeesMessage = (capacity: number) =>
  capacity === 1 ? "This resource is for 1 person." : `Enter a number of people from 1 to ${capacity}.`;

/** Every field name the form can send (the only ones the Server Action reads). */
export const FIELD_NAMES = ["resourceId", "startsAt", "name", "email", "phone", "note", "attendees"] as const;
export type FieldName = (typeof FIELD_NAMES)[number];

/** An exact moment as the browser and server exchange it: "2026-11-17T10:00:00.000Z". Milliseconds at most (#17). */
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;

export const resourceIdSchema = z.uuid();

// PostgreSQL cannot store a NUL character (it would be a database error), so it is refused up front.
const noNul = (value: string) => !value.includes(String.fromCharCode(0));

export function bookingSchema(capacity: number) {
  return z.object({
    resourceId: z.uuid(MESSAGES.resource),
    startsAt: z
      .string(MESSAGES.startsAt)
      .regex(ISO_INSTANT, MESSAGES.startsAt)
      // The DATABASE gets this normalised text (milliseconds, Z), never the raw input (Phase 10 finding 17).
      .transform((value, ctx) => {
        const ms = Date.parse(value);
        if (Number.isNaN(ms)) {
          ctx.addIssue({ code: "custom", message: MESSAGES.startsAt });
          return z.NEVER;
        }
        return new Date(ms).toISOString();
      }),
    name: z.string(MESSAGES.name).trim().min(1, MESSAGES.name).max(LIMITS.name, MESSAGES.name).refine(noNul, MESSAGES.name),
    email: z.string(MESSAGES.email).trim().max(LIMITS.email, MESSAGES.email).pipe(z.email(MESSAGES.email)),
    phone: z
      .string()
      .trim()
      .max(LIMITS.phone, MESSAGES.phone)
      .regex(/^[0-9+()\-.\s]*$/, MESSAGES.phone)
      .transform((v) => (v === "" ? null : v)),
    note: z
      .string()
      .trim()
      .max(LIMITS.note, MESSAGES.note)
      .refine(noNul, MESSAGES.note)
      .transform((v) => (v === "" ? null : v)),
    attendees: z
      .string(attendeesMessage(capacity))
      .trim()
      .regex(/^[0-9]{1,4}$/, attendeesMessage(capacity))
      .transform(Number)
      .pipe(z.number().int().min(1, attendeesMessage(capacity)).max(capacity, attendeesMessage(capacity))),
  });
}

export type BookingInput = z.infer<ReturnType<typeof bookingSchema>>;
export type FieldErrors = Partial<Record<FieldName, string>>;

/** What the visitor typed, as strings (the form's own state). */
export type RawFields = Record<FieldName, string>;

/** One message per field (the first problem). */
export function fieldErrorsFrom(error: z.ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "") as FieldName;
    if ((FIELD_NAMES as readonly string[]).includes(key)) out[key] ??= issue.message;
  }
  return out;
}

/** Validates what the form holds. Used by the browser and by the Server Action. */
export function parseBooking(
  raw: RawFields,
  capacity: number,
): { ok: true; data: BookingInput } | { ok: false; errors: FieldErrors } {
  const result = bookingSchema(capacity).safeParse(raw);
  return result.success ? { ok: true, data: result.data } : { ok: false, errors: fieldErrorsFrom(result.error) };
}

// The status code in /booking/<code>: 32 random bytes written as base64url = exactly 43 characters (A8).
export const STATUS_CODE = /^[A-Za-z0-9_-]{43}$/;
export const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const DATE = /^\d{4}-\d{2}-\d{2}$/;

export type BookingErrorKind =
  | "slot_taken"
  | "limit_reached"
  | "not_bookable"
  | "invalid_slot"
  | "past"
  | "too_far"
  | "too_many_attendees"
  | "rate_limited"
  | "invalid_values"
  | "unknown";

// What the Server Action returns to the form (a success redirects instead).
export type BookingFormState =
  | { status: "idle" }
  | { status: "error"; kind: BookingErrorKind | "fields"; message?: string; fieldErrors?: FieldErrors };

export const initialBookingState: BookingFormState = { status: "idle" };

/** A slot as the browser receives it: exact start moment and the local clock texts. */
export interface PublicSlot {
  startsAt: string;
  start: string;
  end: string;
}

/** The answer to "which times are free on this day?". */
export type DaySlotsResult = { ok: true; slots: PublicSlot[] } | { ok: false };
