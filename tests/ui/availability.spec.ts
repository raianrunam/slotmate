import { expect, test, type Page } from "@playwright/test";
import { serviceClient } from "../db/helpers";
import { addDaysToDate, todayInZone } from "../../src/lib/time/slots";
import { LOGGED_OUT } from "./owner";
import { addResource, addWorkspace, cleanupOwners, forgeOnSubmit, logIn, newOwner, setPlan, tag, type TestOwner } from "./owners";

// Availability checks (Phase 10: AVAIL-01, AVAIL-02, AVAIL-03, D6, D7). Every test has
// its own throw-away owner, logged in with a real session. Hours are saved through the
// real form and Server Action; rows are read back with the server key to see what the
// database really holds.

test.use({ storageState: LOGGED_OUT });
test.afterAll(cleanupOwners);

const ZONE = "Asia/Dhaka"; // no clock changes, +06:00: the preview times are easy to check

async function storedHours(resourceId: string) {
  const { data, error } = await serviceClient()
    .from("resource_availability")
    .select("weekday, opens_at, closes_at")
    .eq("resource_id", resourceId)
    .order("weekday");
  if (error) throw new Error(error.message);
  return data;
}

// To stay under Supabase's sign-in rate limit, the tests that do not depend on the number of
// workspaces or resources share ONE Pro owner per Playwright worker (made on first use); each
// test still gets its OWN new resource, so tests cannot see each other's hours.
let shared: Promise<{ owner: TestOwner; workspaceId: string }> | null = null;
function sharedOwner() {
  shared ??= (async () => {
    const owner = await newOwner();
    await setPlan(owner.id, "pro");
    const workspaceId = await addWorkspace(owner, "Studio", `ws-${tag()}`, ZONE);
    return { owner, workspaceId };
  })();
  return shared;
}

async function setup(page: Page) {
  const { owner, workspaceId } = await sharedOwner();
  const resourceId = await addResource(owner, workspaceId, `Room ${tag()}`); // 30-minute slots
  await logIn(page, owner);
  return { owner, workspaceId, resourceId };
}

const opens = (page: Page, day: string) => page.getByLabel(`${day} opens at`);
const closes = (page: Page, day: string) => page.getByLabel(`${day} closes at`);
const openBox = (page: Page, day: string) => page.getByLabel(`Open on ${day}`);
const save = (page: Page) => page.getByRole("button", { name: "Save opening hours" });
const message = (page: Page) => page.getByTestId("availability-message");

test.describe("edit and save the weekly hours", () => {
  test("opens days, saves them, shows them again after a reload, and writes the database rows", async ({ page }) => {
    const { resourceId } = await setup(page);
    await page.goto(`/dashboard/resources/${resourceId}/availability`);
    await expect(page.getByText("No days are open yet")).toBeVisible();

    await openBox(page, "Monday").check();
    await opens(page, "Monday").fill("9:00");
    await closes(page, "Monday").fill("17:30");
    await openBox(page, "Wednesday").check();
    await opens(page, "Wednesday").fill("08:15");
    await closes(page, "Wednesday").fill("12:00");
    await save(page).click();
    await expect(message(page)).toHaveText("Opening hours saved.");

    expect(await storedHours(resourceId)).toEqual([
      { weekday: 1, opens_at: "09:00:00", closes_at: "17:30:00" },
      { weekday: 3, opens_at: "08:15:00", closes_at: "12:00:00" },
    ]);

    await page.reload();
    await expect(openBox(page, "Monday")).toBeChecked();
    await expect(opens(page, "Monday")).toHaveValue("09:00");
    await expect(closes(page, "Monday")).toHaveValue("17:30");
    await expect(openBox(page, "Tuesday")).not.toBeChecked();
    await expect(opens(page, "Wednesday")).toHaveValue("08:15");
    await expect(page.getByText("No days are open yet")).toHaveCount(0);
  });

  test("changing a day updates it; switching a day to closed removes its row (one window per day)", async ({ page }) => {
    const { owner, resourceId } = await setup(page);
    await owner.client.from("resource_availability").insert([
      { resource_id: resourceId, weekday: 1, opens_at: "09:00", closes_at: "17:00" },
      { resource_id: resourceId, weekday: 2, opens_at: "09:00", closes_at: "17:00" },
    ]);
    await page.goto(`/dashboard/resources/${resourceId}/availability`);
    await closes(page, "Monday").fill("13:00");
    await openBox(page, "Tuesday").uncheck();
    await save(page).click();
    await expect(message(page)).toHaveText("Opening hours saved.");
    expect(await storedHours(resourceId)).toEqual([{ weekday: 1, opens_at: "09:00:00", closes_at: "13:00:00" }]);
  });

  test("a closed day keeps nothing: all days closed removes every row", async ({ page }) => {
    const { owner, resourceId } = await setup(page);
    await owner.client.from("resource_availability").insert([{ resource_id: resourceId, weekday: 5, opens_at: "10:00", closes_at: "14:00" }]);
    await page.goto(`/dashboard/resources/${resourceId}/availability`);
    await openBox(page, "Friday").uncheck();
    await save(page).click();
    await expect(message(page)).toHaveText("Opening hours saved.");
    expect(await storedHours(resourceId)).toEqual([]);
  });

  test("24:00 is accepted as the end of the day and gives slots up to midnight", async ({ page }) => {
    const { resourceId } = await setup(page);
    await page.goto(`/dashboard/resources/${resourceId}/availability`);
    for (const day of ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]) {
      await openBox(page, day).check();
      await opens(page, day).fill("23:00");
      await closes(page, day).fill("24:00");
    }
    await save(page).click();
    await expect(message(page)).toHaveText("Opening hours saved.");
    const rows = await storedHours(resourceId);
    expect(rows).toHaveLength(7);
    expect(rows.every((r) => r.opens_at === "23:00:00" && r.closes_at === "24:00:00")).toBe(true);

    await page.reload();
    await expect(closes(page, "Monday")).toHaveValue("24:00");
    // The last slot of a future day starts at 23:30 (30-minute slots 23:00 and 23:30).
    const inThreeDays = addDaysToDate(todayInZone(ZONE), 3);
    await expect(page.getByTestId(`preview-${inThreeDays}`)).toContainText("23:00, 23:30");
  });

  test("closing at or before opening is refused with a message on that day; nothing is saved", async ({ page }) => {
    const { resourceId } = await setup(page);
    await page.goto(`/dashboard/resources/${resourceId}/availability`);
    await openBox(page, "Thursday").check();
    await opens(page, "Thursday").fill("17:00");
    await closes(page, "Thursday").fill("09:00");
    await save(page).click();
    await expect(page.getByTestId("day-4").getByRole("alert")).toContainText("later than the opening time");
    expect(await storedHours(resourceId)).toEqual([]);

    await closes(page, "Thursday").fill("17:00"); // equal
    await save(page).click();
    await expect(page.getByTestId("day-4").getByRole("alert")).toContainText("later than the opening time");
    expect(await storedHours(resourceId)).toEqual([]);

    await closes(page, "Thursday").fill("17:01");
    await save(page).click();
    await expect(message(page)).toHaveText("Opening hours saved.");
  });

  test("unreadable times are refused, and one bad day stops the whole save", async ({ page }) => {
    const { resourceId } = await setup(page);
    await page.goto(`/dashboard/resources/${resourceId}/availability`);
    await openBox(page, "Monday").check();
    await opens(page, "Monday").fill("9am");
    await closes(page, "Monday").fill("25:00");
    await openBox(page, "Tuesday").check(); // a good day in the same save
    await save(page).click();
    await expect(page.getByTestId("day-1").getByRole("alert")).toHaveCount(2);
    await expect(page.getByText(/Enter the opening time as hours and minutes/)).toBeVisible();
    await expect(page.getByText(/Use 24:00 for the end of the day/).nth(0)).toBeVisible();
    expect(await storedHours(resourceId), "the good day was not saved either").toEqual([]);
  });
});

test.describe("preview of the next 7 days (src/lib/time, workspace time zone)", () => {
  test("shows the workspace time zone and the slots of each day, closed days as Closed", async ({ page }) => {
    const { owner, resourceId } = await setup(page);
    // Monday to Saturday 09:00-11:00 with 30-minute slots; Sunday closed.
    await owner.client.from("resource_availability").insert(
      [1, 2, 3, 4, 5, 6].map((weekday) => ({ resource_id: resourceId, weekday, opens_at: "09:00", closes_at: "11:00" })),
    );
    await page.goto(`/dashboard/resources/${resourceId}/availability`);
    await expect(page.getByTestId("preview-zone")).toContainText(ZONE);
    await expect(page.getByTestId("preview-zone")).toContainText("30 minutes");

    const today = todayInZone(ZONE);
    for (let i = 1; i <= 6; i++) {
      const date = addDaysToDate(today, i);
      const day = new Date(`${date}T00:00:00Z`).getUTCDay(); // 0 = Sunday
      const li = page.getByTestId(`preview-${date}`);
      if (day === 0) await expect(li).toContainText("Closed");
      else await expect(li).toContainText("09:00, 09:30, 10:00, 10:30");
    }
    await expect(page.getByTestId("slot-preview").getByRole("listitem")).toHaveCount(7);
  });
});

test.describe("locked resources (after a downgrade)", () => {
  test("the hours are shown but cannot be changed", async ({ page }) => {
    const owner = await newOwner();
    await setPlan(owner.id, "pro");
    const w1 = await addWorkspace(owner, "One", `ws-${tag()}`, ZONE);
    const w2 = await addWorkspace(owner, "Two", `ws-${tag()}`, ZONE);
    const r1 = await addResource(owner, w1, "Locked room");
    await addResource(owner, w2, "Other room");
    await owner.client.from("resource_availability").insert([{ resource_id: r1, weekday: 1, opens_at: "09:00", closes_at: "17:00" }]);
    await setPlan(owner.id, "free");
    await logIn(page, owner);

    await page.goto(`/dashboard/resources/${r1}/availability`);
    await expect(page.getByText("Locked (plan limit)")).toBeVisible();
    await expect(page.getByRole("button", { name: "Save opening hours" })).toHaveCount(0);
    await expect(openBox(page, "Monday")).toBeDisabled();
    await expect(openBox(page, "Monday")).toBeChecked();
    await expect(opens(page, "Monday")).toBeDisabled();
    await expect(opens(page, "Monday")).toHaveValue("09:00");
    await expect(page.getByTestId("slot-preview")).toBeVisible();
  });

  test("a save for a resource that locked while the form was open is refused and changes nothing", async ({ page }) => {
    const owner = await newOwner();
    await setPlan(owner.id, "pro");
    const w1 = await addWorkspace(owner, "One", `ws-${tag()}`, ZONE);
    const w2 = await addWorkspace(owner, "Two", `ws-${tag()}`, ZONE);
    const r1 = await addResource(owner, w1, "Will lock");
    await addResource(owner, w2, "Other");
    await owner.client.from("resource_availability").insert([{ resource_id: r1, weekday: 2, opens_at: "09:00", closes_at: "17:00" }]);
    await logIn(page, owner);
    await page.goto(`/dashboard/resources/${r1}/availability`);
    await closes(page, "Tuesday").fill("12:00");
    await openBox(page, "Friday").check();

    await setPlan(owner.id, "free"); // locks while the form is open
    await save(page).click();
    await expect(message(page)).toContainText("locked");
    expect(await storedHours(r1)).toEqual([{ weekday: 2, opens_at: "09:00:00", closes_at: "17:00:00" }]);
  });
});

let victimOwner: Promise<{ other: TestOwner; ws: string }> | null = null;

test.describe("another owner's resource (the server refuses)", () => {
  async function victim() {
    // A separate Pro owner per worker, made on first use.
    victimOwner ??= (async () => {
      const other: TestOwner = await newOwner();
      await setPlan(other.id, "pro");
      return { other, ws: await addWorkspace(other, "Victim ws", `ws-${tag()}`, ZONE) };
    })();
    const { other, ws } = await victimOwner;
    const id = await addResource(other, ws, "Victim room");
    await other.client.from("resource_availability").insert([{ resource_id: id, weekday: 1, opens_at: "09:00", closes_at: "17:00" }]);
    return { other, id };
  }

  test("the page of another owner's resource is not found", async ({ page }) => {
    const { id } = await victim();
    await setup(page);
    await page.goto(`/dashboard/resources/${id}/availability`);
    await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
    await expect(page.locator("body")).not.toContainText("Victim room");
  });

  test("a save with a foreign resource id (and forged fields) changes nothing", async ({ page }) => {
    const { id: foreignId } = await victim();
    const { owner, resourceId } = await setup(page);
    await page.goto(`/dashboard/resources/${resourceId}/availability`);
    await openBox(page, "Monday").check();
    await closes(page, "Monday").fill("12:00");
    await forgeOnSubmit(page, "form:has(input[name=id])", { id: foreignId, owner_id: owner.id, resource_id: foreignId, weekday: "1" });
    await save(page).click();
    await expect(message(page)).toContainText("cannot make this change");
    expect(await storedHours(foreignId), "the victim's hours are unchanged").toEqual([{ weekday: 1, opens_at: "09:00:00", closes_at: "17:00:00" }]);
    expect(await storedHours(resourceId), "and nothing was written for the attacker").toEqual([]);
  });
});

test.describe("navigation", () => {
  test("the nav's Availability page lists resources and links to each editor; the resource page links to its hours", async ({ page }) => {
    // A fresh owner: this test looks at the whole list of resources.
    const owner = await newOwner();
    const workspaceId = await addWorkspace(owner, "Studio", `ws-${tag()}`, ZONE);
    const resourceId = await addResource(owner, workspaceId, "Room 1");
    await logIn(page, owner);
    await owner.client.from("resource_availability").insert([
      { resource_id: resourceId, weekday: 1, opens_at: "09:00", closes_at: "17:00" },
      { resource_id: resourceId, weekday: 2, opens_at: "10:00", closes_at: "24:00" },
    ]);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/dashboard");
    await page.getByRole("navigation", { name: "Dashboard" }).getByRole("link", { name: "Availability" }).click();
    await expect(page).toHaveURL(/\/dashboard\/availability$/);
    const card = page.getByTestId("availability-card");
    await expect(card).toContainText("Room 1");
    await expect(card).toContainText("Mon 09:00–17:00");
    await expect(card).toContainText("Tue 10:00–24:00");
    await card.getByRole("link", { name: "Edit opening hours of Room 1" }).click();
    await expect(page).toHaveURL(new RegExp(`/dashboard/resources/${resourceId}/availability$`));

    await page.goto(`/dashboard/resources/${resourceId}`);
    await page.getByRole("link", { name: "Opening hours" }).click();
    await expect(page).toHaveURL(new RegExp(`/dashboard/resources/${resourceId}/availability$`));
  });

  test("logged-out visitors cannot open the availability pages", async ({ page }) => {
    for (const path of ["/dashboard/availability", "/dashboard/resources/00000000-0000-4000-8000-000000000000/availability"]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login\?next=/);
    }
  });
});
