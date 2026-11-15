import { chromium, type FullConfig } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { createTestUser, OWNER_INFO, OWNER_STATE } from "./owner";

// Runs once, after the web server is up: creates one owner (email already
// confirmed, so no email is sent), logs in through the real login form and
// saves the browser session for the dashboard checks.
export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0].use.baseURL!;
  const owner = await createTestUser({ confirmed: true });
  // Written first so the teardown can delete the user even if the login fails.
  writeFileSync(OWNER_INFO, JSON.stringify(owner));

  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ baseURL });
    const page = await context.newPage();
    await page.goto("/login");
    await page.getByLabel("Email").fill(owner.email);
    await page.getByLabel("Password").fill(owner.password);
    await page.getByRole("button", { name: "Log in" }).click();
    await page.waitForURL("**/dashboard");
    await context.storageState({ path: OWNER_STATE });
  } finally {
    await browser.close();
  }
}
