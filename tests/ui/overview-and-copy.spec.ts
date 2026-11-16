import { expect, test } from "@playwright/test";
import { randomBytes } from "node:crypto";
import { serviceClient } from "../db/helpers";
import { todayInZone } from "../../src/lib/time/slots";
import { waitForHydration } from "./helpers";
import { LOGGED_OUT } from "./owner";
import { addResource, addWorkspace, cleanupOwners, logIn, newOwner, setPlan, tag } from "./owners";

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

// DASH-05: the overview shows a 30-day trend across all workspaces; each request is on its own workspace's local date.
test("DASH-05: the overview trend counts every workspace, each request on its own local day, with a table and a note", async ({ page }) => {
  const owner = await newOwner();
  await setPlan(owner.id, "pro"); // Free allows one workspace
  const east = await addWorkspace(owner, "East", `tr-${tag()}`, "Pacific/Kiritimati"); // UTC+14
  const west = await addWorkspace(owner, "West", `tr-${tag()}`, "Pacific/Pago_Pago"); // UTC-11
  for (const [ws, name] of [[east, "East room"], [west, "West room"]] as const) {
    const id = await addResource(owner, ws, name);
    await owner.client.from("resources").update({ slot_minutes: 60 }).eq("id", id);
    await owner.client.from("resource_availability").insert([1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ resource_id: id, weekday, opens_at: "00:00", closes_at: "24:00" })));
    const when = new Date(Date.now() + 3 * 86_400_000);
    when.setUTCMinutes(0, 0, 0);
    const { error } = await serviceClient().rpc("submit_booking", {
      p_resource_id: id,
      p_starts_at: when.toISOString(),
      p_visitor_name: `Visitor ${tag()}`,
      p_visitor_email: `v-${tag()}@example.com`,
      p_visitor_phone: null as unknown as string,
      p_note: null as unknown as string,
      p_attendees: 1,
      p_status_token_hash: `\\x${randomBytes(32).toString("hex")}`,
    });
    expect(error).toBeNull();
  }
  await logIn(page, owner);
  await page.goto("/dashboard");
  const section = page.getByTestId("overview-trend");
  await expect(section.getByRole("heading", { name: "Booking requests, last 30 days" })).toBeVisible();
  await section.getByTestId("overview-trend-table").locator("summary").click();
  const rows = section.getByTestId("overview-trend-table").locator("tbody tr");
  await expect(rows).toHaveCount(30);
  const eastToday = todayInZone("Pacific/Kiritimati");
  const westToday = todayInZone("Pacific/Pago_Pago");
  await expect(rows.last()).toContainText(eastToday); // the window ends at the latest local today
  await expect(rows.filter({ hasText: `(${eastToday})` }).locator("td").last()).toHaveText("1");
  await expect(rows.filter({ hasText: `(${westToday})` }).locator("td").last()).toHaveText("1");
  await expect(section.getByTestId("overview-trend-note")).toContainText("latest local today");
});

test("DASH-05: a new owner sees 'No data yet' and a zero-filled table; another owner's requests are not counted", async ({ page }) => {
  const mine = await newOwner();
  const other = await newOwner();
  await addWorkspace(mine, "Mine", `tr-${tag()}`);
  await addResource(other, await addWorkspace(other, "Other", `tr-${tag()}`), "Not mine");
  await logIn(page, mine);
  await page.goto("/dashboard");
  await expect(page.getByTestId("overview-trend-empty")).toBeVisible();
  const table = page.getByTestId("overview-trend-table");
  await table.locator("summary").click();
  await expect(table.locator("tbody tr")).toHaveCount(30);
  await expect(table.locator("tbody tr td:last-child").filter({ hasNotText: /^0$/ })).toHaveCount(0);
});
