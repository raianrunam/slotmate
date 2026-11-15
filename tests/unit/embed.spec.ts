import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  buildEmbedCode,
  COLOR_PATTERN,
  DEFAULT_EMBED_OPTIONS,
  effectiveEmbedOptions,
  embedPath,
  mapEmbedError,
  MESSAGES,
  normalizeEmbedOptions,
  parseEmbedUpdate,
  readableTextColor,
  workspaceIdSchema,
} from "../../src/features/embed/schema";
import { BOOKING_SOURCE, EMBED_SOURCE, securityHeaderRules, type HeaderRule } from "../../src/lib/security-headers";

// Phase 14: the widget rules that need no browser, server or database.

const read = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8");

// A tiny stand-in for Next.js path matching, enough for the three sources we use.
function matches(source: string, pathname: string): boolean {
  if (source.endsWith("/:path*")) {
    const base = source.slice(0, -"/:path*".length);
    return pathname === base || pathname.startsWith(`${base}/`);
  }
  if (source.includes(":code")) return new RegExp(`^${source.replace(":code", "[^/]+")}$`).test(pathname);
  return new RegExp(`^${source}$`).test(pathname);
}

/** The final value of a header for a path (the LAST matching rule wins, as in Next.js). */
function headersFor(pathname: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rule of securityHeaderRules as HeaderRule[]) {
    if (!matches(rule.source, pathname)) continue;
    for (const h of rule.headers) out[h.key.toLowerCase()] = h.value;
  }
  return out;
}

test.describe("options validation (EMBED-03, EMBED-04, SEC-02)", () => {
  test("accepts a theme alone, or a full valid set", () => {
    expect(parseEmbedUpdate({ theme: "dark", layout: null, backgroundColor: null })).toEqual({ ok: true, data: { theme: "dark" } });
    expect(parseEmbedUpdate({ theme: "light", layout: "grid", backgroundColor: " #A1b2C3 " })).toEqual({
      ok: true,
      data: { theme: "light", layout: "grid", backgroundColor: "#a1b2c3" },
    });
  });
  test("an empty colour means no colour", () => {
    expect(parseEmbedUpdate({ theme: "light", layout: "list", backgroundColor: "" })).toEqual({
      ok: true,
      data: { theme: "light", layout: "list", backgroundColor: null },
    });
  });
  for (const bad of ["red", "#fff", "#12345", "#1234567", "#gggggg", "123456", "#123456;", "url(x)", "#12345 6", "expression(1)", "#123456</style>", "javascript:1"]) {
    test(`refuses the colour ${JSON.stringify(bad)}`, () => {
      const result = parseEmbedUpdate({ theme: "light", layout: "list", backgroundColor: bad });
      expect(result.ok).toBe(false);
      expect(COLOR_PATTERN.test(bad)).toBe(false);
    });
  }
  for (const bad of ["", "blue", "LIGHT", null, undefined, 1, {}, ["dark"]]) {
    test(`refuses the theme ${JSON.stringify(bad)}`, () => {
      expect(parseEmbedUpdate({ theme: bad }).ok).toBe(false);
    });
  }
  test("refuses an unknown layout and a non-text colour", () => {
    expect(parseEmbedUpdate({ theme: "light", layout: "masonry" }).ok).toBe(false);
    expect(parseEmbedUpdate({ theme: "light", backgroundColor: 123456 }).ok).toBe(false);
  });
  test("the workspace id must be a uuid", () => {
    expect(workspaceIdSchema.safeParse("6f1c1f3e-0f55-4c46-9a1b-7b2d4f0f9e11").success).toBe(true);
    for (const bad of ["", "abc", "1", null, undefined, "6f1c1f3e-0f55-4c46-9a1b-7b2d4f0f9e11x"]) {
      expect(workspaceIdSchema.safeParse(bad).success).toBe(false);
    }
  });
});

test.describe("reading options safely (EMBED-05)", () => {
  test("unknown or junk stored values fall back to the defaults", () => {
    expect(normalizeEmbedOptions(null)).toEqual(DEFAULT_EMBED_OPTIONS);
    expect(normalizeEmbedOptions({ theme: "neon", layout: "x", background_color: "red; background:url(x)" })).toEqual(DEFAULT_EMBED_OPTIONS);
    expect(normalizeEmbedOptions({ theme: "dark", layout: "grid", background_color: "#ABCDEF" })).toEqual({
      theme: "dark",
      layout: "grid",
      backgroundColor: "#abcdef",
    });
  });
  const stored = { theme: "dark", layout: "grid", background_color: "#112233" } as const;
  test("Free ignores the Pro values and keeps the theme", () => {
    expect(effectiveEmbedOptions(normalizeEmbedOptions(stored), "free")).toEqual({ theme: "dark", layout: "list", backgroundColor: null });
  });
  test("Pro applies them", () => {
    expect(effectiveEmbedOptions(normalizeEmbedOptions(stored), "pro")).toEqual({ theme: "dark", layout: "grid", backgroundColor: "#112233" });
  });
  test("readable text colour: dark text on light, light text on dark", () => {
    expect(readableTextColor("#ffffff")).toBe("#111111");
    expect(readableTextColor("#000000")).toBe("#ffffff");
    expect(readableTextColor("not a colour")).toBe("#111111");
  });
});

test.describe("the embed code (EMBED-01, EMBED-02)", () => {
  test("holds only the address and the size", () => {
    const code = buildEmbedCode("https://slotmate.example", "acme-studio");
    expect(code).toContain('src="https://slotmate.example/embed/acme-studio"');
    expect(code).toContain('width="100%"');
    expect(code).toContain('height="640"');
    expect(code).not.toMatch(/key|token|secret|id=|theme|layout|color|workspace/i);
    // Every attribute is one of these and nothing else.
    expect([...code.matchAll(/\s([a-z-]+)="/g)].map((m) => m[1])).toEqual(["src", "title", "width", "height", "style", "loading"]);
  });
  test("a trailing slash on the site address is dropped; a bad height falls back", () => {
    expect(buildEmbedCode("https://x.test/", "abc")).toContain('src="https://x.test/embed/abc"');
    expect(buildEmbedCode("https://x.test", "abc", 5)).toContain('height="640"');
    expect(buildEmbedCode("https://x.test", "abc", 800)).toContain('height="800"');
  });
  test("the slug and the address cannot break out of the attribute", () => {
    const code = buildEmbedCode('https://x.test"><script>alert(1)</script>', '"><img src=x onerror=alert(1)>');
    expect(code).not.toContain("<script");
    expect(code).not.toContain("<img");
    expect([...code.matchAll(/\s([a-z-]+)="/g)].map((m) => m[1])).toEqual(["src", "title", "width", "height", "style", "loading"]);
    expect(embedPath("a b/c")).toBe("/embed/a%20b%2Fc");
  });
});

test.describe("frame headers (EMBED-02, SEC)", () => {
  test("/embed/* can be framed by any site and sends no X-Frame-Options", () => {
    for (const p of ["/embed/acme-studio", "/embed/x", "/embed/a/b"]) {
      const h = headersFor(p);
      expect(h["content-security-policy"], p).toBe("frame-ancestors *");
      expect(h["x-frame-options"], p).toBeUndefined();
      expect(h["x-content-type-options"], p).toBe("nosniff");
      expect(h["referrer-policy"], p).toBe("strict-origin-when-cross-origin");
    }
  });
  test("everything else is never framed", () => {
    for (const p of ["/", "/login", "/signup", "/dashboard", "/dashboard/widget", "/dashboard/bookings/1", "/book/acme-studio", "/booking/abc", "/embedded", "/embed", "/auth/confirm", "/pricing", "/x/embed/y"]) {
      const h = headersFor(p);
      expect(h["x-frame-options"], p).toBe("DENY");
      expect(h["content-security-policy"], p).toBe("frame-ancestors 'none'");
      expect(h["x-content-type-options"], p).toBe("nosniff");
    }
  });
  test("the status page keeps its own strict rules", () => {
    const h = headersFor("/booking/abcdef");
    expect(h["cache-control"]).toBe("private, no-store, max-age=0");
    expect(h["referrer-policy"]).toBe("no-referrer");
    expect(h["x-frame-options"]).toBe("DENY");
  });
  test("exactly one rule frees framing, and it is the /embed one", () => {
    const open = securityHeaderRules.filter((r) => r.headers.some((h) => /frame-ancestors \*/.test(h.value)));
    expect(open.map((r) => r.source)).toEqual([EMBED_SOURCE]);
    expect(securityHeaderRules.map((r) => r.source)).toContain(BOOKING_SOURCE);
  });
  test("next.config.ts uses these rules", () => {
    const config = read("next.config.ts");
    expect(config).toMatch(/securityHeaderRules/);
    expect(config).not.toMatch(/frame-ancestors/);
  });
});

test.describe("database errors (never raw text)", () => {
  test("the Pro-only trigger error becomes the upgrade message", () => {
    expect(mapEmbedError({ message: "pro_only_embed_option", code: "P0001" })).toBe(MESSAGES.proOnly);
    expect(mapEmbedError({ message: "  pro_only_embed_option " })).toBe(MESSAGES.proOnly);
  });
  test("other errors become fixed sentences and the raw text never leaks", () => {
    expect(mapEmbedError({ code: "42501", message: "permission denied for table embed_configurations" })).toBe(MESSAGES.notAllowed);
    expect(mapEmbedError({ code: "23514", message: "violates check constraint embed_configurations_background_color_check" })).toBe(MESSAGES.invalidValues);
    const out = mapEmbedError({ code: "XX000", message: "secret internal detail embed_configurations" });
    expect(out).toBe(MESSAGES.generic);
    expect(out).not.toMatch(/secret|embed_configurations/);
  });
});

test.describe("source guards", () => {
  test("the save action checks the owner first, uses the owner's session and writes only the three options", () => {
    const src = read("src/features/embed/actions.ts");
    expect(src.trimStart().startsWith('"use server"')).toBe(true);
    const body = src.slice(src.indexOf("export async function saveWidgetOptions"));
    expect(body.indexOf("await requireOwner()")).toBeGreaterThan(-1);
    expect(body.indexOf("await requireOwner()")).toBeLessThan(body.indexOf("formData.get"));
    expect(body.indexOf("await requireOwner()")).toBeLessThan(body.indexOf("createClient"));
    expect(src).toMatch(/from "@\/lib\/supabase\/server"/);
    expect(src).toMatch(/\.from\("embed_configurations"\)\s*\.update\(changes\)/);
    expect(src).not.toMatch(/error\.message|\.message\b[^;]*return|\.details|\.hint/);
  });
  test("no admin client in the dashboard widget code", () => {
    for (const f of [
      "src/features/embed/actions.ts",
      "src/features/embed/queries.ts",
      "src/features/embed/components/widget-form.tsx",
      "src/features/embed/components/embed-code.tsx",
      "src/app/dashboard/widget/page.tsx",
    ]) {
      expect(read(f), f).not.toMatch(/supabase\/admin|createAdminClient|SERVICE_ROLE|SECRET_KEY/);
    }
  });
  test("the dashboard widget page checks the owner", () => {
    expect(read("src/app/dashboard/widget/page.tsx")).toMatch(/<OwnerGate[\s>]/);
  });
  test("the embed page reads the options only through the public-read module, never raw colours", () => {
    const page = read("src/app/embed/[slug]/page.tsx");
    expect(page).toMatch(/getPublicWorkspace\(slug, \{ embed: true \}\)/);
    expect(page).not.toMatch(/supabase|dangerouslySetInnerHTML|<style/);
    const queries = read("src/features/public-booking/queries.ts");
    expect(queries).toMatch(/effectiveEmbedOptions\(normalizeEmbedOptions\(config\.data\), ownerPlan\)/);
    expect(queries).toMatch(/\.select\("theme, layout, background_color"\)/);
  });
  test("the widget opens the status link in a new tab, safely", () => {
    const flow = read("src/features/public-booking/components/booking-flow.tsx");
    expect(flow).toMatch(/target="_blank" rel="noopener noreferrer"/);
  });
  test("the embed-mode booking returns the status path instead of redirecting inside the frame", () => {
    const actions = read("src/features/public-booking/actions.ts");
    expect(actions).toMatch(/formData\.get\("embed"\) === "1"\) return \{ status: "submitted"/);
  });
});
