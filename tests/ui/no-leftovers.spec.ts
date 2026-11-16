import { expect, test } from "@playwright/test";
import { LOGGED_OUT } from "./owner";

// Final-review check: the public pages carry no unfinished text, at a phone and a desktop width.
test.use({ storageState: LOGGED_OUT });

for (const width of [375, 1280]) {
  for (const route of ["/", "/login", "/signup", "/book/no-such-workspace-xyz", "/this-page-does-not-exist"]) {
    test(`no placeholder or phase text on ${route} at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(route);
      const text = await page.locator("body").innerText();
      expect(text).not.toMatch(/placeholder|phase \d|draft|lorem|not available yet|still being built/i);
    });
  }
}

test("the landing page example card is not clickable and the pricing links work", async ({ page }) => {
  await page.goto("/");
  const hero = page.locator("#hero-heading").locator("xpath=ancestor::section[1]");
  await expect(hero.getByRole("figure")).toBeVisible();
  await expect(hero.getByText("Example", { exact: true })).toBeVisible();
  // The only buttons or links in the hero are the two calls to action.
  await expect(hero.getByRole("link")).toHaveCount(2);
  await expect(hero.getByRole("button")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Get started free" }).first()).toHaveAttribute("href", "/signup");
  await expect(page.getByRole("link", { name: "See pricing" })).toHaveAttribute("href", "/#pricing");
  await expect(page.getByText("Paid plans work, in Stripe test mode")).toBeVisible();
});
