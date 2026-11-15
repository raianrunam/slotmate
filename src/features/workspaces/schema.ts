import { z } from "zod";

// Input rules for the workspace forms. Pure and shared (no secrets, no server
// imports), so the browser form shows the same hints the server enforces.
// The numbers match the CHECK constraints in docs/DATABASE.md section 3.4.

export const NAME_MAX = 100;
export const DESCRIPTION_MAX = 1000;
export const SLUG_MIN = 3;
export const SLUG_MAX = 40;

// Lowercase letters and digits, with single hyphens between them (the same
// pattern as the database check, so a slug that passes here is accepted there).
export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export const MESSAGES = {
  nameMissing: "Enter a name for the workspace.",
  nameLong: `Use at most ${NAME_MAX} characters for the name.`,
  descriptionLong: `Use at most ${DESCRIPTION_MAX} characters for the description.`,
  slug: `Use ${SLUG_MIN} to ${SLUG_MAX} characters: lowercase letters, numbers and single hyphens, not at the start or end.`,
  timeZoneMissing: "Choose a time zone from the list.",
  timeZoneInvalid: "That is not a time zone we know. Choose one from the list.",
  id: "That workspace could not be found.",
} as const;

/** Why a slug is not valid, in plain words; `null` when it is valid. */
export function slugProblem(slug: string): string | null {
  if (slug.length === 0) return `Enter an address of ${SLUG_MIN} to ${SLUG_MAX} characters.`;
  if (slug.length < SLUG_MIN) return `Too short: use at least ${SLUG_MIN} characters.`;
  if (slug.length > SLUG_MAX) return `Too long: use at most ${SLUG_MAX} characters.`;
  if (/[A-Z]/.test(slug)) return "Use lowercase letters only.";
  if (/[^a-z0-9-]/.test(slug)) return "Use only lowercase letters, numbers and hyphens.";
  if (slug.startsWith("-") || slug.endsWith("-")) return "Do not start or end with a hyphen.";
  if (slug.includes("--")) return "Do not use two hyphens in a row.";
  return null;
}

/** A suggested slug made from a workspace name ("Café Ünïon!" -> "cafe-union"). */
export function slugify(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // accents
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SLUG_MAX)
    .replace(/-+$/g, "");
}

/** The public booking address of a slug (D12). */
export function publicPath(slug: string): string {
  return `/book/${slug}`;
}

// -----------------------------------------------------------------------------
// Time zones (D7). The list comes from the JavaScript runtime; the database has
// the final say (validate_time_zone trigger).
// -----------------------------------------------------------------------------
let cachedZones: readonly string[] | null = null;

export function listTimeZones(): readonly string[] {
  if (cachedZones) return cachedZones;
  let zones: string[] = [];
  try {
    zones = Intl.supportedValuesOf("timeZone");
  } catch {
    zones = [];
  }
  // Some runtimes leave out "UTC" although it is a valid zone name.
  if (!zones.includes("UTC")) zones = [...zones, "UTC"];
  cachedZones = [...zones].sort((a, b) => a.localeCompare(b));
  return cachedZones;
}

export function isKnownTimeZone(value: string): boolean {
  return listTimeZones().includes(value);
}

// -----------------------------------------------------------------------------
// Form schema
// -----------------------------------------------------------------------------
const name = z
  .string(MESSAGES.nameMissing)
  .trim()
  .min(1, MESSAGES.nameMissing)
  .max(NAME_MAX, MESSAGES.nameLong);

// An empty description is stored as "no description" (NULL).
const description = z
  .string()
  .trim()
  .max(DESCRIPTION_MAX, MESSAGES.descriptionLong)
  .transform((value) => (value === "" ? null : value));

const slug = z
  .string(MESSAGES.slug)
  .trim()
  .refine((value) => value.length >= SLUG_MIN && value.length <= SLUG_MAX && SLUG_PATTERN.test(value), {
    message: MESSAGES.slug,
  });

const timeZone = z
  .string(MESSAGES.timeZoneMissing)
  .trim()
  .min(1, MESSAGES.timeZoneMissing)
  .refine(isKnownTimeZone, { message: MESSAGES.timeZoneInvalid });

export const workspaceSchema = z.object({ name, description, slug, timeZone });

export const workspaceIdSchema = z.uuid(MESSAGES.id);

export type WorkspaceInput = z.output<typeof workspaceSchema>;
