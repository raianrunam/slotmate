import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { SCREENSHOT_DIR, waitForHydration } from "./helpers";
import { OWNER_STATE } from "./owner";

// Keyboard and interaction checks for the shared pieces: skip link, theme
// toggle, mobile menu, breakpoints, dialogs, pagination.

test.describe("keyboard and theme", () => {
  test("the first Tab stop is a VISIBLE skip link, and it jumps to the main content", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/");
    // Before focus the link is visually hidden: clipped away (sr-only).
    const skip = page.getByRole("link", { name: "Skip to content" });
    const clipBefore = await skip.evaluate((el) => getComputedStyle(el).clipPath);
    expect(clipBefore, "unfocused skip link is clipped (visually hidden)").not.toBe("none");

    await page.keyboard.press("Tab");
    await expect(skip).toBeFocused();
    // Once focused it must really appear: no longer clipped, a readable size, on screen.
    const clipAfter = await skip.evaluate((el) => getComputedStyle(el).clipPath);
    expect(clipAfter, "focused skip link is not clipped").toBe("none");
    const shown = await skip.boundingBox();
    expect(shown!.width, "focused skip link is wide enough to read").toBeGreaterThan(80);
    expect(shown!.height, "focused skip link is tall enough to read").toBeGreaterThan(24);
    expect(shown!.x, "focused skip link is on screen").toBeGreaterThanOrEqual(0);

    mkdirSync(SCREENSHOT_DIR, { recursive: true });
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, "skip-link-focused-375.png"),
      clip: { x: 0, y: 0, width: 375, height: 120 },
    });

    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/#main-content$/);
  });

  test("a keyboard focus ring is drawn on a link and on a button", async ({ page }) => {
    await page.goto("/login");
    // Tab: skip link, logo link, theme button, ...
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    const logo = page.getByRole("link", { name: "SlotMate home" });
    await expect(logo).toBeFocused();
    const ring = await logo.evaluate((el) => getComputedStyle(el).boxShadow);
    expect(ring, "a focus ring (box-shadow) is drawn on the focused link").not.toBe("none");
  });

  test("the theme menu shows the current choice and switches dark and light", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/");
    const html = page.locator("html");
    await page.getByRole("button", { name: "Change colour theme" }).click();
    await expect(page.getByRole("menuitemradio", { name: "System" })).toBeChecked();
    await page.getByRole("menuitemradio", { name: "Dark" }).click();
    await expect(html).toHaveClass(/dark/);
    await page.getByRole("button", { name: "Change colour theme" }).click();
    await expect(page.getByRole("menuitemradio", { name: "Dark" })).toBeChecked();
    await page.getByRole("menuitemradio", { name: "Light" }).click();
    await expect(html).not.toHaveClass(/dark/);
  });

  test("the landing page shows the exact plan limits", async ({ page }) => {
    await page.goto("/#pricing");
    const free = page.getByRole("group", { name: "Free" });
    await expect(free).toContainText("1 workspace");
    await expect(free).toContainText("3 resources");
    await expect(free).toContainText("100 booking requests per month");
    const pro = page.getByRole("group", { name: "Pro" });
    await expect(pro).toContainText("$9.99");
    await expect(pro).toContainText("5 workspaces");
    await expect(pro).toContainText("25 resources");
    await expect(pro).toContainText("1,000 booking requests per month");
  });

  test("the two plan buttons line up", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/#pricing");
    const freeButton = await page.getByRole("link", { name: "Get started free" }).last().boundingBox();
    const proButton = await page.getByRole("link", { name: "Start with Pro" }).boundingBox();
    expect(Math.abs(freeButton!.y - proButton!.y), "button heights differ by this many px").toBeLessThan(2);
  });
});

test.describe("dashboard navigation", () => {
  // The dashboard needs a login (Phase 7): use the saved test-owner session.
  test.use({ storageState: OWNER_STATE });
  test("phone: the sidebar is hidden and the menu opens a sheet that closes on navigation", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/dashboard");
    await expect(page.getByRole("complementary", { name: "Sidebar" })).toBeHidden();

    await page.getByRole("button", { name: "Open menu" }).click();
    const sheet = page.getByRole("dialog");
    await expect(sheet).toBeVisible();
    await sheet.getByRole("link", { name: "Bookings" }).click();
    await expect(page).toHaveURL(/\/dashboard\/bookings$/);
    await expect(sheet).toBeHidden();
  });

  test("phone: Escape closes the menu and focus returns to the menu button", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/dashboard");
    await page.getByRole("button", { name: "Open menu" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(page.getByRole("button", { name: "Open menu" })).toBeFocused();
  });

  test("the menu's close button is big enough to tap on a phone", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/dashboard");
    await page.getByRole("button", { name: "Open menu" }).click();
    const close = await page.getByRole("button", { name: "Close menu" }).boundingBox();
    expect(close!.width).toBeGreaterThanOrEqual(40);
    expect(close!.height).toBeGreaterThanOrEqual(40);
  });

  // The sidebar appears from 1024 px (Tailwind "lg"). Below that, including
  // tablets, the menu button is shown instead.
  for (const [width, sidebar] of [
    [768, false],
    [1023, false],
    [1024, true],
    [1280, true],
  ] as const) {
    test(`at ${width}px the ${sidebar ? "sidebar is shown" : "menu button is shown"}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto("/dashboard/billing");
      const aside = page.getByRole("complementary", { name: "Sidebar" });
      const menuButton = page.getByRole("button", { name: "Open menu" });
      if (sidebar) {
        await expect(aside).toBeVisible();
        await expect(menuButton).toBeHidden();
        await expect(aside.getByRole("link", { name: "Billing" })).toHaveAttribute("aria-current", "page");
      } else {
        await expect(aside).toBeHidden();
        await expect(menuButton).toBeVisible();
      }
    });
  }
});

test.describe("shared components", () => {
  test("a dialog traps keyboard focus until it is closed", async ({ page }) => {
    await page.goto("/design");
    await page.getByRole("button", { name: "Open a dialog" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press("Tab");
      const inside = await page.evaluate(
        () => document.activeElement?.closest("[role=dialog]") !== null,
      );
      expect(inside, "focus stays inside the dialog").toBe(true);
    }
  });

  // The booking status page's search-engine and referrer rules are tested with a real booking
  // in tests/ui/booking.spec.ts (Phase 11).

  test("the form fields connect labels, hints and errors", async ({ page }) => {
    await page.goto("/design");
    const email = page.getByLabel("Email", { exact: true });
    await expect(email).toHaveAttribute("aria-invalid", "true");
    await expect(email).toHaveAttribute("aria-describedby", "d-email-error");
    await expect(page.locator("#d-email-error")).toHaveText("Enter a valid email address.");
  });

  test("form control borders are dark enough to see (about 3:1 or more)", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/login");
    const border = await page.getByLabel("Email").evaluate((el) => getComputedStyle(el).borderTopColor);
    // rgb(r, g, b): require a mid-grey or darker (each channel below about 150).
    const channels = border.match(/\d+(\.\d+)?/g)!.slice(0, 3).map(Number);
    expect(Math.max(...channels), `input border colour ${border} is too light`).toBeLessThan(150);
  });
});

test.describe("shared components (logged in)", () => {
  test.use({ storageState: OWNER_STATE });

  // The delete confirmation dialog (Cancel, Escape, focus return) is now tested on the
  // real workspace list in tests/ui/workspaces.spec.ts (Phase 8).

  test("the account menu works with the keyboard", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/dashboard");
    const button = page.getByRole("button", { name: "Account menu" });
    await waitForHydration(button); // before hydration the Enter key does nothing (Phase 17, flaky test)
    await button.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("menu")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("menu")).toBeHidden();
    await expect(button).toBeFocused();
  });

  // The booking list (20 per page, the address keeps the page, the phone layout) is tested on real data in
  // tests/ui/bookings.spec.ts (Phase 12).

});
