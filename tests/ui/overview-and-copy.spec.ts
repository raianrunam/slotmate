import { expect, test } from "@playwright/test";
import { waitForHydration } from "./helpers";
import { LOGGED_OUT } from "./owner";
import { addResource, addWorkspace, cleanupOwners, logIn, newOwner, tag } from "./owners";

// Phase 17: two gaps found by the requirements checklist.
//  * DASH-02: the overview shows the number of the owner's resources (all workspaces) and follows creates/deletes.
//  * PUB-01: the owner can copy the full public address of a workspace from the dashboard.

test.use({ storageState: LOGGED_OUT });
test.afterAll(cleanupOwners);

test("DASH-02: the overview shows the real number of resources and follows a new and a deleted resource", async ({ page }) => {
  const owner = await newOwner();
  const first = await addWorkspace(owner, "Studio", `ov-${tag()}`);
  await logIn(page, owner);
  await page.goto("/dashboard");
  await expect(page.getByTestId("overview-resources-count")).toHaveText("0");
  const a = await addResource(owner, first, "Room 1");
  await addResource(owner, first, "Room 2");
  await page.goto("/dashboard");
  await expect(page.getByTestId("overview-resources-count")).toHaveText("2");
  await expect(page.getByText("of 3 on the Free plan").first()).toBeVisible();
  const del = await owner.client.from("resources").delete().eq("id", a).select("id");
  expect(del.data?.length).toBe(1);
  await page.goto("/dashboard");
  await expect(page.getByTestId("overview-resources-count")).toHaveText("1");
});

test("DASH-02: another owner's resources are not counted", async ({ page }) => {
  const mine = await newOwner();
  const other = await newOwner();
  await addResource(other, await addWorkspace(other, "Other", `ov-${tag()}`), "Not mine");
  await logIn(page, mine);
  await page.goto("/dashboard");
  await expect(page.getByTestId("overview-resources-count")).toHaveText("0");
});

test("PUB-01: the owner can copy the full public address from the workspace list", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const owner = await newOwner();
  const slug = `cp-${tag()}`;
  await addWorkspace(owner, "Copy me", slug);
  await logIn(page, owner);
  await page.goto("/dashboard/workspaces");
  const button = page.getByRole("button", { name: "Copy link: public address of Copy me" });
  await waitForHydration(button);
  await button.click();
  await expect(button).toHaveText("Copied");
  const text = await page.evaluate(() => navigator.clipboard.readText());
  expect(text).toBe(`${new URL(page.url()).origin}/book/${slug}`);
});
