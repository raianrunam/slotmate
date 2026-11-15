import { createHash, randomBytes } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { serviceClient } from "../db/helpers";
import { addDaysToDate, todayInZone } from "../../src/lib/time/slots";
import { LOGGED_OUT } from "./owner";
import { addResource, addWorkspace, cleanupOwners, logIn, newOwner, setPlan, sharedPerFile, tag, type TestOwner } from "./owners";

// Phase 17 (part C): automated accessibility scans with axe-core (WCAG 2.0/2.1 A and AA rules) of every page
// kind: public, sign-in, dashboard and embed, at 375 px and 1280 px, in the light and the dark theme.
// A page FAILS on any "serious" or "critical" violation. (Lower impacts are reported in the log only: axe
// cannot judge everything, and a scan is no replacement for the manual keyboard and screen reader checks in
// docs/TESTING.md.)

test.afterAll(cleanupOwners);

const service = serviceClient();
const WIDTHS = [
  { width: 375, height: 812 },
  { width: 1280, height: 800 },
] as const;
const THEMES = ["light", "dark"] as const;

interface Fixture {
  owner: TestOwner;
  workspaceId: string;
  resourceId: string;
  bookingId: string;
  slug: string;
  code: string;
  /** A second workspace whose widget is set to the DARK embed theme (the widget follows the owner's choice, not the visitor's). */
  darkSlug: string;
}

/** One Pro owner per worker with a workspace, a resource open all day, and one pending booking with a status link. */
function fixture(): Promise<Fixture> {
  return sharedPerFile("a11y", async () => {
    const owner = await newOwner();
    await setPlan(owner.id, "pro");
    const t = tag();
    const slug = `ax-${t}-${tag()}`;
    const workspaceId = await addWorkspace(owner, `Access ${t}`, slug, "UTC");
    const resourceId = await addResource(owner, workspaceId, `Room ${t}`);
    const rows = [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ resource_id: resourceId, weekday, opens_at: "00:00", closes_at: "24:00" }));
    const av = await owner.client.from("resource_availability").insert(rows);
    if (av.error) throw new Error(`availability insert failed: ${av.error.message}`);
    const darkSlug = `ax-dark-${t}-${tag()}`;
    const darkWs = await addWorkspace(owner, `Dark ${t}`, darkSlug, "UTC");
    const darkRes = await addResource(owner, darkWs, `Dark room ${t}`);
    const darkHours = await owner.client.from("resource_availability").insert([1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ resource_id: darkRes, weekday, opens_at: "00:00", closes_at: "24:00" })));
    if (darkHours.error) throw new Error(`availability insert failed: ${darkHours.error.message}`);
    const dark = await owner.client.from("embed_configurations").update({ theme: "dark" }).eq("workspace_id", darkWs).select("workspace_id");
    if (dark.error || dark.data?.length !== 1) throw new Error("embed theme update failed");
    const code = randomBytes(32).toString("base64url");
    const startsAt = `${addDaysToDate(todayInZone("UTC"), 3)}T10:00:00.000Z`;
    const booked = await service.rpc("submit_booking", {
      p_resource_id: resourceId,
      p_starts_at: startsAt,
      p_visitor_name: `Visitor ${t}`,
      p_visitor_email: `v-${t}@example.com`,
      p_visitor_phone: null as unknown as string,
      p_note: null as unknown as string,
      p_attendees: 1,
      p_status_token_hash: `\\x${createHash("sha256").update(code).digest("hex")}`,
    });
    if (booked.error || !booked.data || booked.data.length !== 1) throw new Error(`submit_booking failed: ${booked.error?.message ?? "no row"}`);
    return { owner, workspaceId, resourceId, bookingId: booked.data[0].booking_id, slug, code, darkSlug };
  });
}

interface Target {
  name: string;
  path: (f: Fixture) => string;
  login?: boolean;
  /** The widget has its own theme (set by the owner), whatever the visitor's browser prefers. */
  embed?: "light" | "dark";
  /** Extra steps before the scan (to reach another state of the same page). */
  prepare?: (page: Page, f: Fixture) => Promise<void>;
}

const TARGETS: Target[] = [
  // public
  { name: "home", path: () => "/" },
  { name: "design", path: () => "/design" },
  { name: "not-found", path: () => "/this-page-does-not-exist" },
  { name: "book (public booking page)", path: (f) => `/book/${f.slug}` },
  {
    name: "book with a time chosen (the form)",
    path: (f) => `/book/${f.slug}`,
    prepare: async (page) => {
      await page.getByLabel("Date", { exact: true }).fill(addDaysToDate(todayInZone("UTC"), 4));
      await page.getByRole("button", { name: /^10:00 to / }).click();
      await expect(page.getByLabel("Name", { exact: true })).toBeVisible();
    },
  },
  { name: "booking status page", path: (f) => `/booking/${f.code}` },
  { name: "booking status page (unknown link)", path: () => `/booking/${"z".repeat(43)}` },
  { name: "embed", path: (f) => `/embed/${f.slug}`, embed: "light" },
  { name: "embed (owner chose the dark theme)", path: (f) => `/embed/${f.darkSlug}`, embed: "dark" },
  // sign-in pages
  { name: "login", path: () => "/login" },
  { name: "signup", path: () => "/signup" },
  { name: "forgot-password", path: () => "/forgot-password" },
  // dashboard (logged in)
  { name: "dashboard", path: () => "/dashboard", login: true },
  { name: "dashboard workspaces", path: () => "/dashboard/workspaces", login: true },
  { name: "dashboard new workspace", path: () => "/dashboard/workspaces/new", login: true },
  { name: "dashboard workspace", path: (f) => `/dashboard/workspaces/${f.workspaceId}`, login: true },
  { name: "dashboard resources", path: () => "/dashboard/resources", login: true },
  { name: "dashboard new resource", path: (f) => `/dashboard/resources/new?workspace=${f.workspaceId}`, login: true },
  { name: "dashboard resource", path: (f) => `/dashboard/resources/${f.resourceId}`, login: true },
  { name: "dashboard resource availability", path: (f) => `/dashboard/resources/${f.resourceId}/availability`, login: true },
  { name: "dashboard availability", path: () => "/dashboard/availability", login: true },
  { name: "dashboard bookings", path: () => "/dashboard/bookings", login: true },
  { name: "dashboard booking", path: (f) => `/dashboard/bookings/${f.bookingId}`, login: true },
  { name: "dashboard analytics", path: () => "/dashboard/analytics", login: true },
  { name: "dashboard widget", path: () => "/dashboard/widget", login: true },
  { name: "dashboard billing", path: () => "/dashboard/billing", login: true },
  { name: "reset-password (logged in)", path: () => "/reset-password", login: true },
];

// For a colour problem, say which colours and ratio axe measured (makes a failure easy to act on).
function detail(node: { any: { data?: unknown }[] }): string {
  const d = node.any[0]?.data as { contrastRatio?: number; fgColor?: string; bgColor?: string } | undefined;
  return d?.contrastRatio ? ` [${d.contrastRatio}:1, text ${d.fgColor} on ${d.bgColor}]` : "";
}

async function scan(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const lines = (impacts: string[]) =>
    results.violations
      .filter((v) => impacts.includes(v.impact ?? ""))
      .map((v) => `${v.impact} ${v.id}: ${v.help} -> ${v.nodes.slice(0, 4).map((n) => n.target.join(" ") + detail(n)).join(" | ")}`);
  return { blocking: lines(["serious", "critical"]), minor: lines(["moderate", "minor"]) };
}

// A scan that silently finds nothing would be worse than none: prove it catches a real violation.
test("the scan itself works: a page with an unlabelled image and a button without a name is reported", async ({ page }) => {
  await page.setContent('<!doctype html><html lang="en"><head><title>x</title></head><body><main><img src="data:image/gif;base64,R0lGODlhAQABAAAAACw="><button></button></main></body></html>');
  const { blocking } = await scan(page);
  expect(blocking.join(" ")).toContain("image-alt");
  expect(blocking.join(" ")).toContain("button-name");
});

for (const theme of THEMES) {
  test.describe(`axe scan, ${theme} theme`, () => {
    test.use({ colorScheme: theme, storageState: LOGGED_OUT });
    test.describe.configure({ timeout: 90_000 });

    for (const { width, height } of WIDTHS) {
      for (const target of TARGETS) {
        test(`${target.name} at ${width}px has no serious or critical violation`, async ({ page }) => {
          const f = await fixture();
          await page.setViewportSize({ width, height });
          if (target.login) await logIn(page, f.owner);
          await page.goto(target.path(f));
          await expect(page.locator("main, [data-testid=embed-root]").first()).toBeVisible();
          const wanted = target.embed ?? theme;
          if (!target.embed || theme === "light") {
            await expect(page.locator(target.embed ? "[data-testid=embed-root]" : "html")).toHaveClass(wanted === "dark" ? /dark/ : /^((?!dark).)*$/);
          }
          if (target.prepare) await target.prepare(page, f);
          const { blocking, minor } = await scan(page);
          if (minor.length > 0) console.log(`[axe minor] ${target.name} ${width}px ${theme}:\n  ${minor.join("\n  ")}`);
          expect(blocking, `${target.name} at ${width}px (${theme})`).toEqual([]);
        });
      }
    }
  });
}
