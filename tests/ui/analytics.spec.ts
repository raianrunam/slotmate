import { expect, test, type Page } from "@playwright/test";
import { randomBytes } from "node:crypto";
import { serviceClient } from "../db/helpers";
import { addDaysToDate, todayInZone } from "../../src/lib/time/slots";
import { LOGGED_OUT } from "./owner";
import { addResource, addWorkspace, cleanupOwners, logIn, newOwner, setPlan, tag, type TestOwner } from "./owners";

// Analytics (Phase 13: ANLT-01 to ANLT-06, A12, D16, DB7). Real paths only: owners are really logged in (RLS applies);
// visitors' bookings are made by the server key calling submit_booking, as the public page does.
// Every test builds its OWN workspace and deletes it at the end.

test.use({ storageState: LOGGED_OUT });
test.afterAll(cleanupOwners);

const service = serviceClient();

const day = (n: number, zone = "UTC") => addDaysToDate(todayInZone(zone), n);
const iso = (date: string, hour: number) => `${date}T${String(hour).padStart(2, "0")}:00:00.000Z`;

interface Fixture {
  workspaceId: string;
  workspaceName: string;
  resourceId: string;
  resourceName: string;
  cleanup: () => Promise<void>;
}

async function makeWorkspace(owner: TestOwner, zone = "UTC", resourceName?: string): Promise<Fixture> {
  const t = tag();
  const workspaceName = `Analytics ${t}`;
  const workspaceId = await addWorkspace(owner, workspaceName, `an-${t}-${tag()}`, zone);
  const name = resourceName ?? `Room ${t}`;
  const resourceId = await addResource(owner, workspaceId, name);
  const resource = await owner.client.from("resources").update({ slot_minutes: 60, capacity: 4 }).eq("id", resourceId).select("id");
  if (resource.error) throw new Error(`resource update failed: ${resource.error.message}`);
  const rows = [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ resource_id: resourceId, weekday, opens_at: "00:00", closes_at: "24:00" }));
  const av = await owner.client.from("resource_availability").insert(rows);
  if (av.error) throw new Error(`availability insert failed: ${av.error.message}`);
  return {
    workspaceId,
    workspaceName,
    resourceId,
    resourceName: name,
    cleanup: async () => {
      await owner.client.from("workspaces").delete().eq("id", workspaceId);
    },
  };
}

/** A visitor's request (server key, submit_booking). The slot is on a future day; "created today" is the request time. */
async function book(resourceId: string, startsAt: string): Promise<string> {
  const { data, error } = await service.rpc("submit_booking", {
    p_resource_id: resourceId,
    p_starts_at: startsAt,
    p_visitor_name: `Visitor ${tag()}`,
    p_visitor_email: `v-${tag()}@example.com`,
    p_visitor_phone: null as unknown as string,
    p_note: null as unknown as string,
    p_attendees: 1,
    p_status_token_hash: `\\x${randomBytes(32).toString("hex")}`,
  });
  if (error || !data || data.length !== 1) throw new Error(`submit_booking failed: ${error?.message ?? "no row"}`);
  return data[0].booking_id;
}

const setStatus = async (owner: TestOwner, id: string, status: "approved" | "rejected" | "cancelled") => {
  const res = await owner.client.from("bookings").update({ status }).eq("id", id).select("id");
  if (res.error) throw new Error(`status change failed: ${res.error.message}`);
};

async function expectNoOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, "page is wider than the screen by this many px").toBeLessThanOrEqual(0);
}

const total = (page: Page, key: string) => page.getByTestId(`total-${key}`);

// A booking made now has created_at = now, so it falls on today's date in the workspace's zone.
async function threeBookings(owner: TestOwner, fx: Fixture) {
  const a = await book(fx.resourceId, iso(day(2), 8));
  const b = await book(fx.resourceId, iso(day(2), 9));
  const c = await book(fx.resourceId, iso(day(2), 10));
  await setStatus(owner, b, "approved");
  await setStatus(owner, c, "rejected");
  return [a, b, c];
}

test.describe("Free owner", () => {
  test("sees the totals, the status chart and the 30-day chart with a text table, and a locked Pro area with no Pro data in the page", async ({ page }) => {
    const owner = await newOwner();
    const fx = await makeWorkspace(owner);
    try {
      await threeBookings(owner, fx);
      await logIn(page, owner);
      await page.goto("/dashboard/analytics");
      await expect(page.getByRole("heading", { level: 1, name: "Analytics" })).toBeVisible();
      await expect(total(page, "all")).toHaveText("3");
      await expect(total(page, "pending")).toHaveText("1");
      await expect(total(page, "approved")).toHaveText("1");
      await expect(total(page, "rejected")).toHaveText("1");
      await expect(total(page, "cancelled")).toHaveText("0");

      await expect(page.getByTestId("chart-daily")).toBeVisible();
      await expect(page.getByTestId("chart-status")).toBeVisible();
      // Text alternative: the table lists all 30 days, zero filled, with today's 3 requests.
      const daily = page.getByTestId("table-daily");
      await daily.locator("summary").click();
      await expect(daily.locator("tbody tr")).toHaveCount(30);
      await expect(daily.locator("tbody tr").last()).toContainText("3");
      await expect(daily.locator("tbody tr").first()).toContainText("0");
      await expect(page.getByTestId("table-status")).toContainText("Approved (33%)");

      // The Pro areas are locked: an upgrade prompt, and no Pro chart or table anywhere.
      await expect(page.getByTestId("locked-monthly").getByRole("link", { name: "Upgrade to Pro" })).toBeVisible();
      await expect(page.getByTestId("locked-resources").getByRole("link", { name: "Upgrade to Pro" })).toBeVisible();
      await expect(page.getByTestId("chart-monthly")).toHaveCount(0);
      await expect(page.getByTestId("chart-resources")).toHaveCount(0);
      await expect(page.getByTestId("table-resources")).toHaveCount(0);
      await expect(page.getByLabel("From")).toHaveCount(0);
      // Not in the HTML at all (the server never sent it): the resource name is absent from the page source.
      const html = await page.content();
      expect(html).not.toContain(fx.resourceName);
    } finally {
      await fx.cleanup();
    }
  });

  test("a from/to in the address is ignored: the period stays the last 30 days", async ({ page }) => {
    const owner = await newOwner();
    const fx = await makeWorkspace(owner);
    try {
      await book(fx.resourceId, iso(day(2), 8));
      await logIn(page, owner);
      await page.goto(`/dashboard/analytics?from=${day(-3)}&to=${day(-2)}`);
      await expect(total(page, "all")).toHaveText("1");
      await page.getByTestId("table-daily").locator("summary").click();
      await expect(page.getByTestId("table-daily").locator("tbody tr")).toHaveCount(30);
    } finally {
      await fx.cleanup();
    }
  });

  test("a workspace with no bookings shows 'No data yet' and zero totals", async ({ page }) => {
    const owner = await newOwner();
    const fx = await makeWorkspace(owner);
    try {
      await logIn(page, owner);
      await page.goto("/dashboard/analytics");
      await expect(page.getByRole("heading", { name: "No data yet" })).toBeVisible();
      await expect(total(page, "all")).toHaveText("0");
      await expect(page.getByTestId("no-data").first()).toBeVisible();
    } finally {
      await fx.cleanup();
    }
  });
});

test("an owner with no workspace sees a friendly empty state with a link to create one", async ({ page }) => {
  const owner = await newOwner();
  await logIn(page, owner);
  await page.goto("/dashboard/analytics");
  await expect(page.getByRole("heading", { name: "Create a workspace first" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Go to workspaces" })).toHaveAttribute("href", "/dashboard/workspaces");
});

test.describe("Pro owner", () => {
  test("sees the monthly chart, resource usage (most used first) and the range filter; the range updates the numbers; a bad range is refused", async ({ page }) => {
    const owner = await newOwner();
    await setPlan(owner.id, "pro");
    const fx = await makeWorkspace(owner);
    const second = await addResource(owner, fx.workspaceId, `Quiet ${tag()}`);
    try {
      await threeBookings(owner, fx);
      await logIn(page, owner);
      await page.goto("/dashboard/analytics");
      await expect(total(page, "all")).toHaveText("3");
      await expect(page.getByTestId("chart-monthly")).toBeVisible();
      await expect(page.getByTestId("table-monthly")).toContainText("3");
      await expect(page.getByTestId("locked-monthly")).toHaveCount(0);
      const usage = page.getByTestId("chart-resources");
      await expect(usage).toBeVisible();
      await usage.locator("summary").click();
      const rows = usage.locator("tbody tr");
      await expect(rows).toHaveCount(2);
      await expect(rows.first()).toContainText(fx.resourceName);
      await expect(rows.first()).toContainText("3");
      expect(second).toBeTruthy();

      // A range in the past with no requests: zero totals and the "no data" message.
      await page.getByLabel("From").fill(day(-20));
      await page.getByLabel("To").fill(day(-10));
      await page.getByRole("button", { name: "Show" }).click();
      await expect(page).toHaveURL(new RegExp(`from=${day(-20)}`));
      await expect(total(page, "all")).toHaveText("0");
      await expect(page.getByRole("heading", { name: "No data yet" })).toBeVisible();

      // An end before the start is refused; the last 30 days are shown instead.
      await page.goto(`/dashboard/analytics?workspace=${fx.workspaceId}&from=${day(-1)}&to=${day(-5)}`);
      await expect(page.getByTestId("range-error")).toContainText("end date cannot be before the start date");
      await expect(total(page, "all")).toHaveText("3");
      // Junk is refused too and never breaks the page.
      await page.goto(`/dashboard/analytics?workspace=${fx.workspaceId}&from=abc&to=2026-99-99`);
      await expect(page.getByTestId("range-error")).toBeVisible();
    } finally {
      await fx.cleanup();
    }
  });

  test("the workspace selector lists only my own workspaces, switches between them, and a foreign id falls back to my first", async ({ page }) => {
    const owner = await newOwner();
    await setPlan(owner.id, "pro");
    const other = await newOwner();
    await setPlan(other.id, "pro");
    const one = await makeWorkspace(owner);
    const two = await makeWorkspace(owner);
    const foreign = await makeWorkspace(other);
    try {
      await book(two.resourceId, iso(day(2), 8));
      await book(two.resourceId, iso(day(2), 9));
      await book(foreign.resourceId, iso(day(2), 8));
      await logIn(page, owner);
      await page.goto("/dashboard/analytics");
      const select = page.getByLabel("Workspace");
      const options = await select.locator("option").allTextContents();
      expect(options).toContain(one.workspaceName);
      expect(options).toContain(two.workspaceName);
      expect(options).not.toContain(foreign.workspaceName);
      // The default is the first (oldest) workspace: no requests there.
      await expect(total(page, "all")).toHaveText("0");
      await select.selectOption(two.workspaceId);
      await page.getByRole("button", { name: "Show" }).click();
      await expect(page).toHaveURL(new RegExp(`workspace=${two.workspaceId}`));
      await expect(total(page, "all")).toHaveText("2");
      // Someone else's workspace id never shows their data: it falls back to the first own workspace.
      await page.goto(`/dashboard/analytics?workspace=${foreign.workspaceId}`);
      await expect(total(page, "all")).toHaveText("0");
      await expect(page.getByLabel("Workspace")).toHaveValue(one.workspaceId);
      await page.goto("/dashboard/analytics?workspace=not-a-uuid");
      await expect(page.getByLabel("Workspace")).toHaveValue(one.workspaceId);
    } finally {
      await one.cleanup();
      await two.cleanup();
      await foreign.cleanup();
    }
  });

  test("a Pro owner whose subscription ended gets the Free view (no Pro data)", async ({ page }) => {
    const owner = await newOwner();
    await setPlan(owner.id, "pro");
    const fx = await makeWorkspace(owner);
    try {
      await book(fx.resourceId, iso(day(2), 8));
      await setPlan(owner.id, "free");
      await logIn(page, owner);
      await page.goto("/dashboard/analytics");
      await expect(page.getByTestId("locked-monthly")).toBeVisible();
      await expect(page.getByTestId("chart-resources")).toHaveCount(0);
    } finally {
      await fx.cleanup();
    }
  });
});

test("on a phone (375px) nothing overflows, for Free and for Pro", async ({ page }) => {
  const owner = await newOwner();
  const fx = await makeWorkspace(owner, "Asia/Dhaka", `A very long resource name for the phone view ${tag()}`);
  try {
    await book(fx.resourceId, iso(day(2), 8));
    await page.setViewportSize({ width: 375, height: 812 });
    await logIn(page, owner);
    await page.goto("/dashboard/analytics");
    await expect(page.getByTestId("chart-daily")).toBeVisible();
    await expectNoOverflow(page);
    await setPlan(owner.id, "pro");
    await page.goto("/dashboard/analytics");
    await expect(page.getByTestId("chart-resources")).toBeVisible();
    await expectNoOverflow(page);
  } finally {
    await fx.cleanup();
  }
});
