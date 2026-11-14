import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { SCREENSHOT_DIR } from "./helpers";

// Opens every shell page at the three tested widths (decision D22: 375 px phone,
// 768 px tablet, 1280 px desktop) and checks the basics:
//  - the page answers with the expected status,
//  - exactly one <h1>, one <main> landmark, and no skipped heading levels,
//  - no console errors or warnings and no uncaught page errors,
//  - no horizontal scrolling,
//  - every form control and every link/button has an accessible name,
// then saves a full-page screenshot OUTSIDE the repository.
// Screenshots go to <home>/slotmate-notes/screenshots, or to the folder in
// the environment variable SLOTMATE_SCREENSHOT_DIR.

const WIDTHS = [
  { width: 375, height: 812 }, // phone
  { width: 768, height: 1024 }, // tablet
  { width: 1280, height: 800 }, // desktop
] as const;

interface ShellRoute {
  name: string;
  path: string;
  status?: number;
}

const ROUTES: readonly ShellRoute[] = [
  { name: "home", path: "/" },
  { name: "login", path: "/login" },
  { name: "signup", path: "/signup" },
  { name: "forgot-password", path: "/forgot-password" },
  { name: "reset-password", path: "/reset-password" },
  { name: "dashboard", path: "/dashboard" },
  { name: "dashboard-workspaces", path: "/dashboard/workspaces" },
  { name: "dashboard-resources", path: "/dashboard/resources" },
  { name: "dashboard-availability", path: "/dashboard/availability" },
  { name: "dashboard-bookings", path: "/dashboard/bookings" },
  { name: "dashboard-analytics", path: "/dashboard/analytics" },
  { name: "dashboard-widget", path: "/dashboard/widget" },
  { name: "dashboard-billing", path: "/dashboard/billing" },
  { name: "book", path: "/book/sample-workspace" },
  { name: "booking-status", path: "/booking/sample-code" },
  { name: "embed", path: "/embed/sample-workspace" },
  { name: "design", path: "/design" },
  { name: "not-found", path: "/this-page-does-not-exist", status: 404 },
];

// Routes that are also checked in the dark theme (at phone and desktop width).
const DARK_ROUTES = ["home", "login", "dashboard", "dashboard-bookings", "book", "embed", "design"];

async function checkPage(
  page: Page,
  route: ShellRoute,
  width: number,
  height: number,
  suffix: string,
) {
  const problems: string[] = [];
  // A page that correctly answers 404 makes the browser log "Failed to load
  // resource ... 404" for the page ITSELF. Only that exact message, for that
  // exact address, is expected; any other failed resource still counts.
  page.on("console", (msg) => {
    if (msg.type() !== "error" && msg.type() !== "warning") return;
    const isOwn404 =
      route.status === 404 &&
      /Failed to load resource.*404/.test(msg.text()) &&
      msg.location().url.endsWith(route.path);
    if (isOwn404) return;
    problems.push(`console ${msg.type()}: ${msg.text()}`);
  });
  page.on("pageerror", (error) => problems.push(`page error: ${error.message}`));

  await page.setViewportSize({ width, height });
  const response = await page.goto(route.path);
  expect(response?.status(), "HTTP status").toBe(route.status ?? 200);

  // Wait for the page (including streamed parts) by waiting for its heading.
  await expect(page.getByRole("heading", { level: 1 }), "one h1").toHaveCount(1);
  await expect(page.locator("main#main-content"), "one main landmark").toHaveCount(1);
  await expect(page.locator("main, [role=main]"), "no other main landmark").toHaveCount(1);

  // Heading order: starts at h1 and never skips a level going down.
  const levels = await page.evaluate(() =>
    Array.from(document.querySelectorAll("h1, h2, h3, h4, h5, h6")).map((h) =>
      Number(h.tagName.slice(1)),
    ),
  );
  expect(levels[0], "first heading is h1").toBe(1);
  levels.forEach((level, i) => {
    if (i > 0) expect(level, `heading order ${levels.join(",")}`).toBeLessThanOrEqual(levels[i - 1] + 1);
  });

  // No horizontal scrolling of the page.
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow, "page is wider than the screen by this many px").toBeLessThanOrEqual(0);

  // Accessible names: every control has a label, every link and button has a name.
  const unnamed = await page.evaluate(() => {
    const bad: string[] = [];
    const visible = (el: Element) => {
      const r = (el as HTMLElement).getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };
    document
      .querySelectorAll("input:not([type=hidden]), textarea, select, [role=combobox]")
      .forEach((el) => {
        // Radix Switch and Select add a hidden form-bridge <input>/<select> with
        // aria-hidden="true". It is not exposed to assistive technology, so it
        // needs no name.
        if (el.closest('[aria-hidden="true"]')) return;
        const input = el as HTMLInputElement;
        const named =
          (input.labels && input.labels.length > 0) ||
          el.getAttribute("aria-label") ||
          el.getAttribute("aria-labelledby");
        if (!named) bad.push(`control without a label: <${el.tagName.toLowerCase()} id="${el.id}">`);
      });
    document.querySelectorAll("a[href], button").forEach((el) => {
      if (!visible(el)) return;
      const text = (el.textContent ?? "").trim();
      // A <button> can also be named by a <label for="...">, as the switches are.
      const labels = (el as HTMLButtonElement).labels;
      if (
        !text &&
        !el.getAttribute("aria-label") &&
        !el.getAttribute("aria-labelledby") &&
        !(labels && labels.length > 0)
      ) {
        bad.push(`<${el.tagName.toLowerCase()}> without a name`);
      }
    });
    // aria-labelledby must point at something that exists.
    document.querySelectorAll("[aria-labelledby]").forEach((el) => {
      const ids = (el.getAttribute("aria-labelledby") ?? "").split(/\s+/).filter(Boolean);
      for (const id of ids) {
        if (!document.getElementById(id)) bad.push(`aria-labelledby points at missing id "${id}"`);
      }
    });
    return bad;
  });
  expect(unnamed, "accessibility name problems").toEqual([]);

  mkdirSync(SCREENSHOT_DIR, { recursive: true });
  await page.screenshot({
    path: path.join(SCREENSHOT_DIR, `${route.name}-${width}${suffix}.png`),
    fullPage: true,
  });

  expect(problems, "console and page errors").toEqual([]);
}

test.describe("shells, light theme", () => {
  test.use({ colorScheme: "light" });
  for (const route of ROUTES) {
    for (const { width, height } of WIDTHS) {
      test(`${route.name} at ${width}px`, async ({ page }) => {
        await checkPage(page, route, width, height, "");
      });
    }
  }
});

test.describe("shells, dark theme", () => {
  test.use({ colorScheme: "dark" });
  for (const route of ROUTES.filter((r) => DARK_ROUTES.includes(r.name))) {
    for (const { width, height } of [WIDTHS[0], WIDTHS[2]]) {
      test(`${route.name} at ${width}px (dark)`, async ({ page }) => {
        await checkPage(page, route, width, height, "-dark");
        await expect(page.locator("html"), "dark class on <html>").toHaveClass(/dark/);
      });
    }
  }
});
