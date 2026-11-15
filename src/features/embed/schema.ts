import { z } from "zod";
import type { PlanId } from "@/lib/plans";

// The widget options (EMBED-03 to EMBED-07, D17, D26). Pure and shared: no secrets, no
// server imports, so the dashboard form, the Server Actions, the embed page and the
// unit tests all use the same rules.
//
// Free: theme (light or dark). Pro only: layout "grid" and a background colour (EMBED-04).
// The database trigger enforce_embed_plan_rules is the real guard for saving; the embed
// page also ignores leftover Pro values of an owner who is no longer Pro (EMBED-05).

export const EMBED_THEMES = ["light", "dark"] as const;
export const EMBED_LAYOUTS = ["list", "grid"] as const;
export type EmbedTheme = (typeof EMBED_THEMES)[number];
export type EmbedLayout = (typeof EMBED_LAYOUTS)[number];

/** Only a plain "#rrggbb" colour. Same rule as the database check (SEC-02). */
export const COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

/** The options as stored for a workspace. */
export interface EmbedOptions {
  theme: EmbedTheme;
  layout: EmbedLayout;
  backgroundColor: string | null;
}

export const DEFAULT_EMBED_OPTIONS: EmbedOptions = { theme: "light", layout: "list", backgroundColor: null };

export const MESSAGES = {
  theme: "Choose light or dark.",
  layout: "Choose list or grid.",
  color: "Use a colour like #1a2b3c: a # followed by six letters or digits (0-9, a-f).",
  workspace: "That workspace could not be found.",
  proOnly: "Grid layout and a background colour are part of the Pro plan. Upgrade to Pro to use them.",
  locked:
    "This workspace is read-only because it is locked after a plan downgrade, so its widget cannot be changed.",
  notAllowed: "You cannot change this widget. The workspace may not exist or may belong to someone else.",
  invalidValues: "Some values are not allowed. Check the form and try again.",
  generic: "Something went wrong. Please try again.",
  saved: "Widget options saved.",
} as const;

export const workspaceIdSchema = z.uuid(MESSAGES.workspace);

/**
 * What a save request may contain. theme is always sent. layout and backgroundColor are
 * sent only by owners who can use them (a Free owner's form has them disabled, so they are
 * missing); a missing value means "leave as it is". An empty colour means "no colour".
 */
export const embedUpdateSchema = z.object({
  theme: z.enum(EMBED_THEMES, MESSAGES.theme),
  layout: z.enum(EMBED_LAYOUTS, MESSAGES.layout).optional(),
  backgroundColor: z
    .string()
    .trim()
    .refine((v) => v === "" || COLOR_PATTERN.test(v), MESSAGES.color)
    .transform((v) => (v === "" ? null : v.toLowerCase()))
    .optional(),
});

export type EmbedUpdate = z.infer<typeof embedUpdateSchema>;
export type EmbedFieldErrors = Partial<Record<"theme" | "layout" | "backgroundColor", string>>;

export function parseEmbedUpdate(
  raw: { theme?: unknown; layout?: unknown; backgroundColor?: unknown },
): { ok: true; data: EmbedUpdate } | { ok: false; errors: EmbedFieldErrors } {
  // null (field not in the form) is "missing"; anything else must pass the rules.
  const input: Record<string, unknown> = { theme: raw.theme };
  if (raw.layout !== null && raw.layout !== undefined) input.layout = raw.layout;
  if (raw.backgroundColor !== null && raw.backgroundColor !== undefined) input.backgroundColor = raw.backgroundColor;
  const result = embedUpdateSchema.safeParse(input);
  if (result.success) return { ok: true, data: result.data };
  const errors: EmbedFieldErrors = {};
  for (const issue of result.error.issues) {
    const key = String(issue.path[0] ?? "");
    if (key === "theme" || key === "layout" || key === "backgroundColor") errors[key] ??= issue.message;
  }
  return { ok: false, errors };
}

/**
 * Turns whatever came out of the database into safe options. A value that is not exactly
 * one of the known ones falls back to the default, so nothing unvalidated reaches the page.
 */
export function normalizeEmbedOptions(row: { theme?: unknown; layout?: unknown; background_color?: unknown } | null | undefined): EmbedOptions {
  const theme = EMBED_THEMES.find((t) => t === row?.theme) ?? DEFAULT_EMBED_OPTIONS.theme;
  const layout = EMBED_LAYOUTS.find((l) => l === row?.layout) ?? DEFAULT_EMBED_OPTIONS.layout;
  const color = typeof row?.background_color === "string" && COLOR_PATTERN.test(row.background_color) ? row.background_color.toLowerCase() : null;
  return { theme, layout, backgroundColor: color };
}

/**
 * EMBED-05: Pro-only values count only while the owner is really Pro. After a downgrade the
 * stored grid layout and colour are kept in the database but ignored here.
 */
export function effectiveEmbedOptions(saved: EmbedOptions, plan: PlanId): EmbedOptions {
  if (plan === "pro") return saved;
  return { theme: saved.theme, layout: "list", backgroundColor: null };
}

/** WCAG relative luminance of an exact #rrggbb colour (0 black ... 1 white). */
export function relativeLuminance(colour: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => Number.parseInt(colour.slice(i, i + 2), 16) / 255);
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** WCAG contrast ratio of two exact #rrggbb colours (1 to 21). */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const DARK_TEXT = "#000000"; // pure black: with white as the other choice the better of the two is always at least 4.58:1
const LIGHT_TEXT = "#ffffff";

/** "#ffffff" or "#000000", whichever has the better contrast on the given background (always at least 4.5:1). */
export function readableTextColor(background: string): string {
  if (!COLOR_PATTERN.test(background)) return DARK_TEXT;
  return contrastRatio(background, DARK_TEXT) >= contrastRatio(background, LIGHT_TEXT) ? DARK_TEXT : LIGHT_TEXT;
}

/**
 * The colour variables the widget sets when the owner chose a background colour (Pro). Every part of the
 * booking form reads these (cards, panels, borders, muted text), so the whole widget follows the colour and
 * the text keeps its contrast. Only ever called with an exact #rrggbb (checked here again).
 */
export function embedColorVariables(background: string): Record<string, string> {
  if (!COLOR_PATTERN.test(background)) return {};
  const text = readableTextColor(background);
  const mix = (percent: number) => `color-mix(in srgb, ${text} ${percent}%, ${background})`;
  return {
    "--background": background,
    "--foreground": text,
    "--card": background,
    "--card-foreground": text,
    "--popover": background,
    "--popover-foreground": text,
    // The accent (buttons, the "Selected" word, the chosen time) is the text colour on this background, and its text is the
    // background colour: always the best contrast the colour allows, whatever colour the owner chose.
    "--primary": text,
    "--primary-foreground": background,
    "--ring": mix(70),
    "--muted": mix(8),
    "--muted-foreground": mix(75),
    "--border": mix(28),
    "--input": mix(60),
  };
}

export const EMBED_HEIGHT = 640;

function escapeAttribute(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

/**
 * The snippet an owner pastes into another website (EMBED-01, EMBED-02). It holds ONLY the
 * public address of the widget and its size: no keys, no ids, no options (the options are
 * read from the database when the widget loads, so changing them needs no new code).
 * The slug is URL-encoded, and every attribute value is escaped.
 */
export function buildEmbedCode(origin: string, slug: string, height: number = EMBED_HEIGHT): string {
  const base = origin.replace(/\/+$/, "");
  const src = `${base}/embed/${encodeURIComponent(slug)}`;
  const h = Number.isInteger(height) && height >= 300 && height <= 2000 ? height : EMBED_HEIGHT;
  return `<iframe
  src="${escapeAttribute(src)}"
  title="Book with SlotMate"
  width="100%"
  height="${h}"
  style="border:0"
  loading="lazy"
></iframe>`;
}

/** The address of the widget (also used by the dashboard preview). */
export function embedPath(slug: string): string {
  return `/embed/${encodeURIComponent(slug)}`;
}

/** Maps a database error from saving the options to one of the fixed messages (never raw text). */
export function mapEmbedError(error: { code?: string | null; message?: string | null }): string {
  const message = (error.message ?? "").trim();
  if (message === "pro_only_embed_option") return MESSAGES.proOnly;
  if (error.code === "42501") return MESSAGES.notAllowed;
  if (error.code === "23514" || error.code === "22P02") return MESSAGES.invalidValues;
  return MESSAGES.generic;
}
