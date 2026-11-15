import { expect, test, type Page } from "@playwright/test";
import { randomBytes } from "node:crypto";
import { serviceClient } from "../db/helpers";
import { clockIn } from "../../src/lib/time/format";
import { addDaysToDate, todayInZone } from "../../src/lib/time/slots";
import { LOGGED_OUT } from "./owner";
import { addResource, addWorkspace, cleanupOwners, forgeOnSubmit, logIn, newOwner, setPlan, sharedPerFile, tag, type TestOwner } from "./owners";

// Booking management (Phase 12: BOOK-01 to BOOK-08, NOTIF-02, DASH-03/04/06, D10, D13, D15, D19, D21, D25, Q9).
// Real paths only: owners are really logged in (the app's own login cookie, RLS applies); visitors' bookings
// are made by our server key calling submit_booking, exactly as the public page does; the server key is used
// to read back what the database holds and to lock items (a downgrade, as the Stripe webhook does it).
//
// Every test builds its OWN workspace and deletes it at the end, so tests share an owner without sharing data.

test.use({ storageState: LOGGED_OUT });
test.afterAll(cleanupOwners);

const service = serviceClient();

// One Pro owner per worker (many bookings, and the monthly count only ever grows, D19), and a second owner.
function proOwner(): Promise<TestOwner> {
  return sharedPerFile("pro", async () => {
    const owner = await newOwner();
    await setPlan(owner.id, "pro");
    return owner;
  });
}
function secondOwner(): Promise<TestOwner> {
  return sharedPerFile("second", async () => {
    const owner = await newOwner();
    await setPlan(owner.id, "pro");
    return owner;
  });
}

const day = (n: number, zone = "UTC") => addDaysToDate(todayInZone(zone), n);
const iso = (date: string, hour: number) => `${date}T${String(hour).padStart(2, "0")}:00:00.000Z`;

interface Fixture {
  workspaceId: string;
  slug: string;
  workspaceName: string;
  resourceId: string;
  resourceName: string;
  cleanup: () => Promise<void>;
}

/** A workspace (own zone) with one resource open 24 hours a day on all seven weekdays, built as the owner (RLS). */
async function makeWorkspace(owner: TestOwner, zone = "UTC", resourceName?: string): Promise<Fixture> {
  const t = tag();
  const slug = `bk-${t}-${tag()}`;
  const workspaceName = `Studio ${t}`;
  const workspaceId = await addWorkspace(owner, workspaceName, slug, zone);
  const name = resourceName ?? `Room ${t}`;
  const resourceId = await addResource(owner, workspaceId, name);
  const resource = await owner.client.from("resources").update({ slot_minutes: 60, capacity: 4 }).eq("id", resourceId).select("id");
  if (resource.error) throw new Error(`resource update failed: ${resource.error.message}`);
  const rows = [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ resource_id: resourceId, weekday, opens_at: "00:00", closes_at: "24:00" }));
  const av = await owner.client.from("resource_availability").insert(rows);
  if (av.error) throw new Error(`availability insert failed: ${av.error.message}`);
  return {
    workspaceId,
    slug,
    workspaceName,
    resourceId,
    resourceName: name,
    cleanup: async () => {
      await owner.client.from("workspaces").delete().eq("id", workspaceId);
    },
  };
}

interface Who {
  name?: string;
  email?: string;
  phone?: string | null;
  note?: string | null;
  attendees?: number;
}

/** A visitor's request, made the way the public page makes it (server key, submit_booking). Returns the booking id. */
async function book(resourceId: string, startsAt: string, who: Who = {}): Promise<string> {
  const { data, error } = await service.rpc("submit_booking", {
    p_resource_id: resourceId,
    p_starts_at: startsAt,
    p_visitor_name: who.name ?? `Visitor ${tag()}`,
    p_visitor_email: who.email ?? `v-${tag()}@example.com`,
    p_visitor_phone: (who.phone ?? null) as string,
    p_note: (who.note ?? null) as string,
    p_attendees: who.attendees ?? 1,
    p_status_token_hash: `\\x${randomBytes(32).toString("hex")}`,
  });
  if (error || !data || data.length !== 1) throw new Error(`submit_booking failed: ${error?.message ?? "no row"}`);
  return data[0].booking_id;
}

/** Many bookings at once: one per hour over as many days as needed. */
async function bookMany(resourceId: string, count: number, name: (i: number) => string): Promise<string[]> {
  const ids: string[] = [];
  for (let start = 0; start < count; start += 8) {
    const batch = await Promise.all(
      Array.from({ length: Math.min(8, count - start) }, (_, k) => {
        const i = start + k;
        return book(resourceId, iso(day(2 + Math.floor(i / 24)), i % 24), { name: name(i) });
      }),
    );
    ids.push(...batch);
  }
  return ids;
}

const setStatus = async (owner: TestOwner, id: string, status: "approved" | "rejected" | "cancelled") => {
  const res = await owner.client.from("bookings").update({ status }).eq("id", id).select("id");
  if (res.error) throw new Error(`status change failed: ${res.error.message}`);
};
const statusInDb = async (owner: TestOwner, id: string) => (await owner.client.from("bookings").select("status").eq("id", id).maybeSingle()).data?.status ?? null;

const rows = (page: Page) => page.getByTestId("booking-row");
const rowFor = (page: Page, name: string) => rows(page).filter({ hasText: name });
const bell = (page: Page) => page.getByTestId("header-notifications");

async function expectNoOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, "page is wider than the screen by this many px").toBeLessThanOrEqual(0);
}

async function expectNamedControls(page: Page) {
  const bad = await page.evaluate(() => {
    const out: string[] = [];
    document.querySelectorAll("input:not([type=hidden]), textarea, select").forEach((el) => {
      const input = el as HTMLInputElement;
      if (!(input.labels && input.labels.length > 0) && !el.getAttribute("aria-label")) out.push(`unlabelled <${el.tagName.toLowerCase()} id="${el.id}">`);
    });
    document.querySelectorAll("a[href], button").forEach((el) => {
      const r = (el as HTMLElement).getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      if (!(el.textContent ?? "").trim() && !el.getAttribute("aria-label") && !el.getAttribute("aria-labelledby")) out.push(`<${el.tagName.toLowerCase()}> without a name`);
    });
    return out;
  });
  expect(bad).toEqual([]);
}

async function expectNotFound(page: Page) {
  await expect(page.getByRole("heading", { level: 1, name: "Page not found" })).toBeVisible();
}

// ---------------------------------------------------------------------------
// The list (BOOK-01)
// ---------------------------------------------------------------------------
test.describe("the list", () => {
  test("shows name, resource, workspace, date and time in the workspace's NAMED zone, attendees and status; newest first; only my bookings", async ({ page }) => {
    const owner = await proOwner();
    const other = await secondOwner();
    const fx = await makeWorkspace(owner, "America/New_York");
    const foreign = await makeWorkspace(other);
    try {
      const date = day(5);
      const first = await book(fx.resourceId, iso(date, 15), { name: `First ${tag()}`, attendees: 3 });
      const second = await book(fx.resourceId, iso(date, 17), { name: `Second ${tag()}` });
      const theirs = await book(foreign.resourceId, iso(date, 15), { name: `Foreign ${tag()}` });
      await setStatus(owner, second, "approved");
      await logIn(page, owner);
      await page.goto("/dashboard/bookings");

      const mine = rows(page).filter({ hasText: fx.resourceName });
      await expect(mine).toHaveCount(2);
      // Newest first: the second request is above the first.
      await expect(mine.nth(0)).toContainText("Second");
      await expect(mine.nth(1)).toContainText("First");
      const secondRow = mine.nth(0);
      const firstRow = mine.nth(1);
      // 15:00 UTC is a different clock time in New York; the zone is named, as the workspace's own zone.
      const start = clockIn(iso(date, 15), "America/New_York");
      const end = clockIn(iso(date, 16), "America/New_York");
      await expect(firstRow).toContainText(`${start} to ${end}`);
      await expect(firstRow).toContainText("New York time (America/New_York)");
      await expect(firstRow).toContainText(fx.workspaceName);
      await expect(firstRow).toContainText(fx.resourceName);
      await expect(firstRow.getByRole("cell", { name: "3", exact: true })).toBeVisible();
      await expect(firstRow).toContainText("Pending");
      await expect(secondRow).toContainText("Approved");
      // The visitor's name opens the details.
      await expect(firstRow.getByRole("link", { name: /First/ })).toHaveAttribute("href", `/dashboard/bookings/${first}`);
      // Only this owner's bookings are shown.
      await expect(page.getByText(foreign.resourceName)).toHaveCount(0);
      expect(await statusInDb(other, theirs)).toBe("pending");
    } finally {
      await fx.cleanup();
      await foreign.cleanup();
    }
  });

  test("a new owner with no bookings sees a friendly empty message", async ({ page }) => {
    const owner = await newOwner();
    await logIn(page, owner);
    await page.goto("/dashboard/bookings");
    await expect(page.getByRole("heading", { name: "No booking requests yet" })).toBeVisible();
    await expect(rows(page)).toHaveCount(0);
    await expect(bell(page)).toHaveAttribute("aria-label", "Notifications: no pending booking requests");
    await expect(page.getByTestId("nav-pending-count")).toHaveCount(0);
  });

  test("on a phone the resource and the time move under the name; nothing overflows; controls have names", async ({ page }) => {
    const owner = await proOwner();
    const fx = await makeWorkspace(owner, "Europe/London");
    try {
      const date = day(4);
      await book(fx.resourceId, iso(date, 9), { name: `Phone ${tag()}` });
      await page.setViewportSize({ width: 375, height: 812 });
      await logIn(page, owner);
      await page.goto("/dashboard/bookings");
      const row = rows(page).filter({ hasText: fx.resourceName });
      await expect(row).toHaveCount(1);
      const hint = row.locator("span.block.sm\\:hidden");
      await expect(hint).toBeVisible();
      await expect(hint).toContainText(fx.resourceName);
      await expect(hint).toContainText(`${clockIn(iso(date, 9), "Europe/London")} to ${clockIn(iso(date, 10), "Europe/London")}`);
      await expect(hint).toContainText("London time (Europe/London)");
      await expect(page.getByRole("columnheader", { name: "Resource" })).toBeHidden();
      await expectNoOverflow(page);
      await expectNamedControls(page);
    } finally {
      await fx.cleanup();
    }
  });

  test("pagination: 45 bookings make 3 pages of 20, 20 and 5; a page past the end shows the last page", async ({ page }) => {
    const owner = await proOwner();
    const fx = await makeWorkspace(owner);
    try {
      await bookMany(fx.resourceId, 45, (i) => `Bulk ${String(i).padStart(2, "0")} ${fx.resourceId.slice(0, 6)}`);
      await logIn(page, owner);
      await page.goto("/dashboard/bookings?q=" + fx.resourceId.slice(0, 6));
      await expect(rows(page)).toHaveCount(20);
      await expect(page.getByText("Showing 1–20 of 45")).toBeVisible();
      await expect(page.getByText("Page 1 of 3")).toBeVisible();
      // Newest first: the last one made is at the top of page 1.
      const firstPageNames = await rows(page).locator("td:first-child a").allTextContents();
      await page.getByRole("link", { name: "Next" }).click();
      await expect(page).toHaveURL(/page=2/);
      await expect(page.getByText("Page 2 of 3")).toBeVisible();
      await expect(rows(page)).toHaveCount(20);
      await expect(page.getByText("Showing 21–40 of 45")).toBeVisible();
      const secondPageNames = await rows(page).locator("td:first-child a").allTextContents();
      expect(secondPageNames.some((n) => firstPageNames.includes(n)), "no booking appears on two pages").toBe(false);
      await page.getByRole("link", { name: "Next" }).click();
      await expect(rows(page)).toHaveCount(5);
      await expect(page.getByText("Page 3 of 3")).toBeVisible();
      // Out of range: clamps to the last page. Nonsense: page 1.
      await page.goto(`/dashboard/bookings?q=${fx.resourceId.slice(0, 6)}&page=999`);
      await expect(page.getByText("Page 3 of 3")).toBeVisible();
      await expect(rows(page)).toHaveCount(5);
      await page.goto(`/dashboard/bookings?q=${fx.resourceId.slice(0, 6)}&page=abc`);
      await expect(page.getByText("Page 1 of 3")).toBeVisible();
      await page.goto(`/dashboard/bookings?q=${fx.resourceId.slice(0, 6)}&page=-3`);
      await expect(page.getByText("Page 1 of 3")).toBeVisible();
    } finally {
      await fx.cleanup();
    }
  });
});

// ---------------------------------------------------------------------------
// Filter and search (BOOK-07, BOOK-08)
// ---------------------------------------------------------------------------
test.describe("filter and search", () => {
  test("the status buttons are toggle buttons; each shows only its status; the choice, the search and the page live in the address", async ({ page }) => {
    const owner = await proOwner();
    const fx = await makeWorkspace(owner);
    try {
      const t = tag();
      const date = day(3);
      const pending = await book(fx.resourceId, iso(date, 8), { name: `Pend ${t}` });
      const approved = await book(fx.resourceId, iso(date, 9), { name: `Appr ${t}` });
      const rejected = await book(fx.resourceId, iso(date, 10), { name: `Rej ${t}` });
      const cancelled = await book(fx.resourceId, iso(date, 11), { name: `Canc ${t}` });
      await setStatus(owner, approved, "approved");
      await setStatus(owner, rejected, "rejected");
      await setStatus(owner, cancelled, "approved");
      await setStatus(owner, cancelled, "cancelled");
      expect(await statusInDb(owner, pending)).toBe("pending");
      await logIn(page, owner);
      await page.goto(`/dashboard/bookings?q=${t}`);
      await expect(rows(page)).toHaveCount(4);

      const group = page.getByRole("group", { name: "Filter by status" });
      await expect(group.getByRole("button", { name: "all" })).toHaveAttribute("aria-pressed", "true");
      for (const [status, label, name] of [
        ["pending", "Pending", "Pend"],
        ["approved", "Approved", "Appr"],
        ["rejected", "Rejected", "Rej"],
        ["cancelled", "Cancelled", "Canc"],
      ] as const) {
        await group.getByRole("button", { name: status }).click();
        await expect(page).toHaveURL(new RegExp(`status=${status}`));
        await expect(page).toHaveURL(new RegExp(`q=${t}`)); // the search is kept
        await expect(rows(page)).toHaveCount(1);
        await expect(rows(page).first()).toContainText(name);
        await expect(rows(page).first()).toContainText(label);
        await expect(page.getByRole("group", { name: "Filter by status" }).getByRole("button", { name: status })).toHaveAttribute("aria-pressed", "true");
        await expect(page.getByRole("group", { name: "Filter by status" }).getByRole("button", { name: "all" })).toHaveAttribute("aria-pressed", "false");
      }
      await page.getByRole("group", { name: "Filter by status" }).getByRole("button", { name: "all" }).click();
      await expect(rows(page)).toHaveCount(4);
      // A status filter with no match says so.
      await page.goto(`/dashboard/bookings?status=rejected&q=${t}-nothing`);
      await expect(page.getByRole("heading", { name: "No bookings match" })).toBeVisible();
      // An unknown status falls back to All.
      await page.goto(`/dashboard/bookings?status=bogus&q=${t}`);
      await expect(rows(page)).toHaveCount(4);
    } finally {
      await fx.cleanup();
    }
  });

  test("search finds a visitor name, an email or a resource name, ignoring case; no match and clearing both work", async ({ page }) => {
    const owner = await proOwner();
    const fx = await makeWorkspace(owner, "UTC", `Zebra Room ${tag()}`);
    const fx2 = await makeWorkspace(owner);
    try {
      const t = tag();
      const date = day(3);
      await book(fx.resourceId, iso(date, 8), { name: `Ada ${t}`, email: `ada-${t}@mail.example.com` });
      await book(fx2.resourceId, iso(date, 8), { name: `Grace ${t}`, email: `hopper-${t}@navy.example.com` });
      await logIn(page, owner);
      await page.goto("/dashboard/bookings");
      const search = page.getByLabel("Search by visitor name, email or resource");
      const searchFor = async (text: string) => {
        await search.fill(text);
        await search.press("Enter");
        await expect(page).toHaveURL(/q=/);
      };

      await searchFor(`ADA ${t}`); // name, other case
      await expect(rows(page)).toHaveCount(1);
      await expect(rows(page).first()).toContainText("Ada");
      await searchFor(`HOPPER-${t}@NAVY`); // email, other case
      await expect(rows(page)).toHaveCount(1);
      await expect(rows(page).first()).toContainText("Grace");
      await searchFor(fx.resourceName.toUpperCase()); // resource name
      await expect(rows(page)).toHaveCount(1);
      await expect(rows(page).first()).toContainText("Ada");
      await searchFor(`no-such-${t}`);
      await expect(page.getByRole("heading", { name: "No bookings match" })).toBeVisible();
      // Clearing the search shows everything again.
      await search.fill("");
      await search.press("Enter");
      await expect(page).toHaveURL(/q=$/); // an empty search: nothing is filtered
      await expect(page.getByRole("heading", { name: "No bookings match" })).toHaveCount(0);
      await expect(rows(page).filter({ hasText: `Ada ${t}` })).toHaveCount(1);
      await expect(rows(page).filter({ hasText: `Grace ${t}` })).toHaveCount(1);
    } finally {
      await fx.cleanup();
      await fx2.cleanup();
    }
  });

  test('"%" and "_" are typed literally; commas, quotes, brackets and a backslash are ordinary text; nothing breaks the query', async ({ page }) => {
    const owner = await proOwner();
    const fx = await makeWorkspace(owner);
    try {
      const t = tag();
      const date = day(3);
      const names = {
        percent: `Full 100% ${t}`,
        percentDecoy: `Full 100x ${t}`,
        underscore: `Under_score ${t}`,
        underscoreDecoy: `UnderXscore ${t}`,
        comma: `Brien, Pat (VIP) ${t}`,
        quote: `Say "hi" ${t}`,
        backslash: `Back\\slash ${t}`,
        dot: `a.b ${t}`,
        plain: `Plain ${t}`,
      };
      let hour = 0;
      for (const name of Object.values(names)) await book(fx.resourceId, iso(date, hour++), { name });
      await logIn(page, owner);

      const expectOnly = async (text: string, expected: string[]) => {
        await page.goto(`/dashboard/bookings?q=${encodeURIComponent(text)}`);
        await expect(rows(page), `search for ${text}`).toHaveCount(expected.length);
        for (const name of expected) await expect(rowFor(page, name)).toHaveCount(1);
      };
      await expectOnly(`100% ${t}`, [names.percent]); // not "100x": % is a letter
      await expectOnly(`%`, [names.percent]); // a lone % is not "match everything" (other tests' data may exist, so check the decoy is absent)
      await expect(rowFor(page, names.plain)).toHaveCount(0);
      await expectOnly(`r_s`, [names.underscore]); // "_" is not "any one letter": "UnderXscore" has "rXs"
      await expect(rowFor(page, names.underscoreDecoy)).toHaveCount(0);
      await expectOnly(`Brien, Pat (VIP) ${t}`, [names.comma]);
      await expectOnly(`"hi" ${t}`, [names.quote]);
      await expectOnly(`Back\\slash ${t}`, [names.backslash]);
      await expectOnly(`\\`, [names.backslash]);
      await expectOnly(`a.b ${t}`, [names.dot]);
      await expectOnly(`),resource_id.neq.0,(${t}`, []); // a filter-injection attempt matches nothing and breaks nothing
      await expect(page.getByRole("heading", { name: "No bookings match" })).toBeVisible();
    } finally {
      await fx.cleanup();
    }
  });

  test("the search text is trimmed and cut to 100 characters, and a very long address value does not break the page", async ({ page }) => {
    const owner = await proOwner();
    await logIn(page, owner);
    await page.goto(`/dashboard/bookings?q=${"x".repeat(5000)}`);
    await expect(page.getByRole("heading", { level: 1, name: "Bookings" })).toBeVisible();
    await expect(page.getByLabel("Search by visitor name, email or resource")).toHaveValue("x".repeat(100));
    await page.goto(`/dashboard/bookings?q=${encodeURIComponent("   spaced   ")}`);
    await expect(page.getByLabel("Search by visitor name, email or resource")).toHaveValue("spaced");
    await page.goto("/dashboard/bookings?q=a&q=b&status=pending&status=approved&page=2&page=3");
    await expect(page.getByRole("heading", { level: 1, name: "Bookings" })).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// The details page (BOOK-02)
// ---------------------------------------------------------------------------
test.describe("the details page", () => {
  test("shows every visitor field, the resource, the workspace, the times in the named zone, the history and when it was submitted", async ({ page }) => {
    const owner = await proOwner();
    const fx = await makeWorkspace(owner, "Asia/Tokyo");
    try {
      const date = day(6);
      const t = tag();
      const id = await book(fx.resourceId, iso(date, 5), {
        name: `Detail ${t}`,
        email: `detail-${t}@example.com`,
        phone: "+44 20 7946 0000",
        note: `Needs a projector ${t}`,
        attendees: 2,
      });
      await logIn(page, owner);
      await page.goto(`/dashboard/bookings/${id}`);
      const facts = page.getByTestId("booking-details");
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(`Detail ${t}`);
      await expect(facts).toContainText(`Detail ${t}`);
      await expect(facts).toContainText(`detail-${t}@example.com`);
      await expect(facts).toContainText("+44 20 7946 0000");
      await expect(facts).toContainText(`Needs a projector ${t}`);
      await expect(facts).toContainText("Attendees");
      await expect(facts.locator("dt:has-text('Attendees') + dd")).toHaveText("2");
      await expect(facts).toContainText(fx.resourceName);
      await expect(facts).toContainText(fx.workspaceName);
      await expect(facts).toContainText(`${clockIn(iso(date, 5), "Asia/Tokyo")} to ${clockIn(iso(date, 6), "Asia/Tokyo")}`);
      await expect(facts).toContainText("Tokyo time (Asia/Tokyo)");
      await expect(facts).toContainText(/Submitted\s*\d{1,2} \w{3} \d{4}, \d{2}:\d{2} UTC/);
      await expect(page.getByTestId("booking-history")).toContainText("Waiting for your decision.");
      await expect(page.getByRole("button", { name: "Approve", exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: "Reject", exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: "Cancel booking" })).toHaveCount(0); // only an approved booking can be cancelled
      // The optional fields say so when they are empty.
      const bare = await book(fx.resourceId, iso(date, 8), { name: `Bare ${t}` });
      await page.goto(`/dashboard/bookings/${bare}`);
      await expect(page.getByTestId("booking-details")).toContainText("Not given");
      await expect(page.getByTestId("booking-details")).toContainText("No note");
      await expectNoOverflow(page);
      await expectNamedControls(page);
    } finally {
      await fx.cleanup();
    }
  });

  test("another owner's booking, an unknown id and a malformed id all show 'not found'", async ({ page }) => {
    const owner = await proOwner();
    const other = await secondOwner();
    const fx = await makeWorkspace(other);
    try {
      const theirs = await book(fx.resourceId, iso(day(4), 9), { name: `Secret ${tag()}`, email: `secret-${tag()}@example.com` });
      await logIn(page, owner);
      for (const id of [theirs, "11111111-1111-4111-8111-111111111111", "not-a-uuid", "../x"]) {
        await page.goto(`/dashboard/bookings/${id}`);
        await expectNotFound(page);
        await expect(page.getByText("secret-")).toHaveCount(0);
      }
    } finally {
      await fx.cleanup();
    }
  });
});

// ---------------------------------------------------------------------------
// The actions (BOOK-03 to BOOK-06, D10, D13, NOTIF-02, NOTIF-03)
// ---------------------------------------------------------------------------
test.describe("approve, reject, cancel, delete", () => {
  test("approve: status changes, a success message shows, the pending badge goes down, the page offers Cancel booking instead", async ({ page }) => {
    const owner = await proOwner();
    const fx = await makeWorkspace(owner);
    try {
      const a = await book(fx.resourceId, iso(day(3), 9), { name: `Approve ${tag()}` });
      await book(fx.resourceId, iso(day(3), 10), { name: `Waiting ${tag()}` });
      await logIn(page, owner);
      await page.goto(`/dashboard/bookings/${a}`);
      await expect(bell(page)).toHaveAttribute("aria-label", "Notifications: 2 pending booking requests");
      await expect(page.getByTestId("nav-pending-count")).toContainText("2");
      await page.getByRole("button", { name: "Approve", exact: true }).click();
      await expect(page.getByTestId("booking-notice")).toHaveText("Booking approved.");
      await expect(page.getByTestId("booking-details").locator("..").getByText("Approved", { exact: true }).first()).toBeVisible();
      expect(await statusInDb(owner, a)).toBe("approved");
      await expect(page.getByTestId("booking-history")).toContainText("Approved on");
      await expect(bell(page)).toHaveAttribute("aria-label", "Notifications: 1 pending booking request");
      await expect(page.getByTestId("nav-pending-count")).toContainText("1");
      await expect(page.getByRole("button", { name: "Approve", exact: true })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Cancel booking" })).toBeVisible();
    } finally {
      await fx.cleanup();
    }
  });

  test("reject: status changes, the time is free again on the public page, the badge goes down", async ({ page, browser, baseURL }) => {
    const owner = await proOwner();
    const fx = await makeWorkspace(owner);
    try {
      const date = day(3);
      const id = await book(fx.resourceId, iso(date, 14), { name: `Reject ${tag()}` });
      const publicSees = async (visible: boolean) => {
        const context = await browser.newContext({ baseURL, extraHTTPHeaders: { "x-forwarded-for": `10.${1 + Math.floor(Math.random() * 254)}.${1 + Math.floor(Math.random() * 254)}.7` } });
        const p = await context.newPage();
        await p.goto(`/book/${fx.slug}`);
        await p.getByLabel("Date", { exact: true }).fill(date);
        await expect(p.getByRole("button", { name: /^13:00 to / })).toBeVisible();
        await expect(p.getByRole("button", { name: /^14:00 to / })).toHaveCount(visible ? 1 : 0);
        await context.close();
      };
      await publicSees(false); // pending holds the slot (D10)
      await logIn(page, owner);
      await page.goto(`/dashboard/bookings/${id}`);
      await page.getByRole("button", { name: "Reject", exact: true }).click();
      await expect(page.getByTestId("booking-notice")).toHaveText("Booking rejected. The time is free again.");
      expect(await statusInDb(owner, id)).toBe("rejected");
      await expect(page.getByTestId("booking-history")).toContainText("Rejected on");
      await expect(page.getByRole("button", { name: "Approve", exact: true })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Reject", exact: true })).toHaveCount(0);
      await publicSees(true);
    } finally {
      await fx.cleanup();
    }
  });

  test("cancel asks first (Keep it and Escape change nothing); confirming cancels and the same time can be booked again on the public page", async ({ page, browser, baseURL }) => {
    const owner = await proOwner();
    const fx = await makeWorkspace(owner);
    try {
      const date = day(4);
      const id = await book(fx.resourceId, iso(date, 11), { name: `Cancel ${tag()}` });
      await setStatus(owner, id, "approved");
      await logIn(page, owner);
      await page.goto(`/dashboard/bookings/${id}`);

      await page.getByRole("button", { name: "Cancel booking" }).click();
      const dialog = page.getByRole("alertdialog");
      await expect(dialog).toBeVisible();
      await dialog.getByRole("button", { name: "Keep it" }).click();
      await expect(dialog).toBeHidden();
      expect(await statusInDb(owner, id)).toBe("approved");
      await page.getByRole("button", { name: "Cancel booking" }).click();
      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
      expect(await statusInDb(owner, id)).toBe("approved");

      // While approved, the time is NOT offered to visitors.
      const context = await browser.newContext({ baseURL, extraHTTPHeaders: { "x-forwarded-for": "10.77.1.1" } });
      const visitor = await context.newPage();
      await visitor.goto(`/book/${fx.slug}`);
      await visitor.getByLabel("Date", { exact: true }).fill(date);
      await expect(visitor.getByRole("button", { name: /^10:00 to / })).toBeVisible();
      await expect(visitor.getByRole("button", { name: /^11:00 to / })).toHaveCount(0);

      await page.getByRole("button", { name: "Cancel booking" }).click();
      await page.getByRole("alertdialog").getByRole("button", { name: "Cancel booking" }).click();
      await expect(page.getByTestId("booking-notice")).toHaveText("Booking cancelled. The time is free again.");
      expect(await statusInDb(owner, id)).toBe("cancelled");
      await expect(page.getByTestId("booking-history")).toContainText("Cancelled on");
      await expect(page.getByRole("button", { name: "Cancel booking" })).toHaveCount(0);

      // D10: the visitor can now book exactly that time, through the public page.
      await visitor.goto(`/book/${fx.slug}`);
      await visitor.getByLabel("Date", { exact: true }).fill(date);
      await visitor.getByRole("button", { name: /^11:00 to / }).click();
      await visitor.getByLabel("Name", { exact: true }).fill(`Again ${tag()}`);
      await visitor.getByLabel("Email").fill(`again-${tag()}@example.com`);
      await visitor.getByRole("button", { name: "Request booking" }).click();
      await visitor.waitForURL(/\/booking\/[A-Za-z0-9_-]{43}/);
      await context.close();
      const mine = await owner.client.from("bookings").select("id, status").eq("resource_id", fx.resourceId).eq("starts_at", iso(date, 11));
      expect((mine.data ?? []).map((b) => b.status).sort()).toEqual(["cancelled", "pending"]);
    } finally {
      await fx.cleanup();
    }
  });

  test("delete asks first (Cancel and Escape keep it); confirming deletes it, shows a message, and the month's count is not given back (D19)", async ({ page }) => {
    const owner = await proOwner();
    const fx = await makeWorkspace(owner);
    try {
      const t = tag();
      const id = await book(fx.resourceId, iso(day(3), 9), { name: `Delete ${t}` });
      const used = async () => (await service.from("monthly_usage").select("booking_count").eq("owner_id", owner.id)).data?.reduce((s, r) => s + r.booking_count, 0) ?? 0;
      const before = await used();
      await logIn(page, owner);
      await page.goto(`/dashboard/bookings/${id}`);
      await page.getByRole("button", { name: `Delete booking of Delete ${t}` }).click();
      const dialog = page.getByRole("alertdialog");
      await expect(dialog).toContainText("permanently");
      await dialog.getByRole("button", { name: "Cancel" }).click();
      await expect(dialog).toBeHidden();
      expect(await statusInDb(owner, id)).toBe("pending");
      await page.getByRole("button", { name: `Delete booking of Delete ${t}` }).click();
      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
      expect(await statusInDb(owner, id)).toBe("pending");

      await page.getByRole("button", { name: `Delete booking of Delete ${t}` }).click();
      await page.getByRole("alertdialog").getByRole("button", { name: "Delete booking" }).click();
      await page.waitForURL(/\/dashboard\/bookings\?notice=deleted/);
      await expect(page.getByTestId("booking-notice")).toHaveText("Booking deleted.");
      expect(await statusInDb(owner, id)).toBeNull();
      await expect(rowFor(page, `Delete ${t}`)).toHaveCount(0);
      expect(await used(), "deleting did not give the request back").toBe(before);
      await page.goto(`/dashboard/bookings/${id}`);
      await expectNotFound(page);
    } finally {
      await fx.cleanup();
    }
  });

  test("a delete works in every status", async ({ page }) => {
    const owner = await proOwner();
    const fx = await makeWorkspace(owner);
    try {
      const date = day(3);
      const rejected = await book(fx.resourceId, iso(date, 9));
      await setStatus(owner, rejected, "rejected");
      const cancelled = await book(fx.resourceId, iso(date, 10));
      await setStatus(owner, cancelled, "approved");
      await setStatus(owner, cancelled, "cancelled");
      await logIn(page, owner);
      for (const [id, name] of [[rejected, "rejected"], [cancelled, "cancelled"]] as const) {
        await page.goto(`/dashboard/bookings/${id}`);
        await expect(page.getByRole("button", { name: "Approve", exact: true })).toHaveCount(0);
        await page.getByRole("button", { name: /^Delete booking of / }).click();
        await page.getByRole("alertdialog").getByRole("button", { name: "Delete booking" }).click();
        await page.waitForURL(/notice=deleted/);
        expect(await statusInDb(owner, id), name).toBeNull();
      }
    } finally {
      await fx.cleanup();
    }
  });

  test("two tabs: approve in one, reject in the other. Exactly one wins and the other gets the friendly message", async ({ browser, baseURL }) => {
    const owner = await proOwner();
    const fx = await makeWorkspace(owner);
    const context = await browser.newContext({ baseURL });
    try {
      const id = await book(fx.resourceId, iso(day(3), 9), { name: `Race ${tag()}` });
      const first = await context.newPage();
      await logIn(first, owner);
      const second = await context.newPage();
      await first.goto(`/dashboard/bookings/${id}`);
      await second.goto(`/dashboard/bookings/${id}`);
      // Both tabs show a pending booking with both buttons.
      await expect(first.getByRole("button", { name: "Reject", exact: true })).toBeVisible();
      await expect(second.getByRole("button", { name: "Approve", exact: true })).toBeVisible();

      await first.getByRole("button", { name: "Approve", exact: true }).click();
      await expect(first.getByTestId("booking-notice")).toHaveText("Booking approved.");
      // The second tab is stale: it still offers Reject.
      await second.getByRole("button", { name: "Reject", exact: true }).click();
      await expect(second.getByTestId("booking-action-error")).toHaveText("This booking was already changed. Reload the page to see its status.");
      expect(await statusInDb(owner, id), "the first change won").toBe("approved");
      await second.reload();
      await expect(second.getByTestId("booking-history")).toContainText("Approved on");
    } finally {
      await context.close();
      await fx.cleanup();
    }
  });

  test("two tabs clicking at the same moment: exactly one change takes effect", async ({ browser, baseURL }) => {
    const owner = await proOwner();
    const fx = await makeWorkspace(owner);
    const context = await browser.newContext({ baseURL });
    try {
      const id = await book(fx.resourceId, iso(day(3), 9), { name: `Same moment ${tag()}` });
      const first = await context.newPage();
      await logIn(first, owner);
      const second = await context.newPage();
      await first.goto(`/dashboard/bookings/${id}`);
      await second.goto(`/dashboard/bookings/${id}`);
      await Promise.all([first.getByRole("button", { name: "Approve", exact: true }).click(), second.getByRole("button", { name: "Reject", exact: true }).click()]);
      await expect.poll(() => statusInDb(owner, id)).toMatch(/^(approved|rejected)$/);
      const final = await statusInDb(owner, id);
      const winner = final === "approved" ? first : second;
      const loser = final === "approved" ? second : first;
      await expect(winner.getByTestId("booking-notice")).toBeVisible();
      await expect(loser.getByTestId("booking-action-error")).toHaveText("This booking was already changed. Reload the page to see its status.");
    } finally {
      await context.close();
      await fx.cleanup();
    }
  });

  test("the SAME action in a stale second tab (approve twice, cancel twice) is refused too: a repeated action cannot pass as a no-op", async ({ browser, baseURL }) => {
    // Rejecting after approving is also stopped by the database trigger; approving twice or cancelling twice is
    // NOT (setting a status to itself is allowed), so only the "where status is still ..." guard of the action stops it.
    const owner = await proOwner();
    const fx = await makeWorkspace(owner);
    const context = await browser.newContext({ baseURL });
    try {
      const id = await book(fx.resourceId, iso(day(3), 9), { name: `Twice ${tag()}` });
      const first = await context.newPage();
      await logIn(first, owner);
      const second = await context.newPage();
      await first.goto(`/dashboard/bookings/${id}`);
      await second.goto(`/dashboard/bookings/${id}`);
      await first.getByRole("button", { name: "Approve", exact: true }).click();
      await expect(first.getByTestId("booking-notice")).toHaveText("Booking approved.");
      await second.getByRole("button", { name: "Approve", exact: true }).click();
      await expect(second.getByTestId("booking-action-error")).toHaveText("This booking was already changed. Reload the page to see its status.");

      // The same for cancel: both tabs show an approved booking, the first cancels, the second is stale.
      await first.goto(`/dashboard/bookings/${id}`);
      await second.goto(`/dashboard/bookings/${id}`);
      await first.getByRole("button", { name: "Cancel booking" }).click();
      await first.getByRole("alertdialog").getByRole("button", { name: "Cancel booking" }).click();
      await expect(first.getByTestId("booking-notice")).toHaveText("Booking cancelled. The time is free again.");
      await second.getByRole("button", { name: "Cancel booking" }).click();
      await second.getByRole("alertdialog").getByRole("button", { name: "Cancel booking" }).click();
      await expect(second.getByTestId("booking-action-error")).toHaveText("This booking was already changed. Reload the page to see its status.");
      expect(await statusInDb(owner, id)).toBe("cancelled");
    } finally {
      await context.close();
      await fx.cleanup();
    }
  });

  test("the message always answers the LAST click: an old refusal does not hide a newer one", async ({ browser, baseURL }) => {
    const owner = await proOwner();
    const fx = await makeWorkspace(owner);
    const context = await browser.newContext({ baseURL });
    try {
      const id = await book(fx.resourceId, iso(day(3), 9), { name: `Last click ${tag()}` });
      const tab = await context.newPage();
      await logIn(tab, owner);
      await tab.goto(`/dashboard/bookings/${id}`);
      await setStatus(owner, id, "approved"); // the page is now stale: it still offers Approve and Reject
      await tab.getByRole("button", { name: "Approve", exact: true }).click();
      await expect(tab.getByTestId("booking-action-error")).toContainText("already changed");
      expect((await owner.client.from("bookings").delete().eq("id", id).select("id")).error).toBeNull(); // now it does not exist at all
      await tab.getByRole("button", { name: "Reject", exact: true }).click();
      await expect(tab.getByTestId("booking-action-error")).toHaveText("That booking could not be found. It may have been deleted.");
    } finally {
      await context.close();
      await fx.cleanup();
    }
  });

  test("a booking deleted in another tab gives 'could not be found', not a crash", async ({ browser, baseURL }) => {
    const owner = await proOwner();
    const fx = await makeWorkspace(owner);
    const context = await browser.newContext({ baseURL });
    try {
      const id = await book(fx.resourceId, iso(day(3), 9), { name: `Gone ${tag()}` });
      const tab = await context.newPage();
      await logIn(tab, owner);
      await tab.goto(`/dashboard/bookings/${id}`);
      expect((await owner.client.from("bookings").delete().eq("id", id).select("id")).error).toBeNull();
      await tab.getByRole("button", { name: "Approve", exact: true }).click();
      await expect(tab.getByTestId("booking-action-error")).toHaveText("That booking could not be found. It may have been deleted.");
    } finally {
      await context.close();
      await fx.cleanup();
    }
  });
});

// ---------------------------------------------------------------------------
// Another owner's booking through the actions (BOOK-03, BOOK-06)
// ---------------------------------------------------------------------------
test.describe("another owner's booking, refused through the actions", () => {
  test("approve, reject and delete with a forged booking id change and delete nothing", async ({ page }) => {
    const attacker = await proOwner();
    const victim = await secondOwner();
    const mine = await makeWorkspace(attacker);
    const theirs = await makeWorkspace(victim);
    try {
      const own = await book(mine.resourceId, iso(day(3), 9), { name: `Own ${tag()}` });
      const foreign = await book(theirs.resourceId, iso(day(3), 9), { name: `Foreign ${tag()}` });
      const approvedForeign = await book(theirs.resourceId, iso(day(3), 10), { name: `Foreign approved ${tag()}` });
      await setStatus(victim, approvedForeign, "approved");
      await logIn(page, attacker);

      // Approve: the page shows MY booking; the form is tampered with just before it is sent.
      await page.goto(`/dashboard/bookings/${own}`);
      await forgeOnSubmit(page, "form", { id: foreign });
      await page.getByRole("button", { name: "Approve", exact: true }).click();
      await expect(page.getByTestId("booking-action-error")).toHaveText("That booking could not be found. It may have been deleted.");
      expect(await statusInDb(victim, foreign)).toBe("pending");
      expect(await statusInDb(attacker, own)).toBe("pending");

      // Reject, the same way.
      await page.reload();
      await forgeOnSubmit(page, "form", { id: foreign });
      await page.getByRole("button", { name: "Reject", exact: true }).click();
      await expect(page.getByTestId("booking-action-error")).toBeVisible();
      expect(await statusInDb(victim, foreign)).toBe("pending");

      // Cancel (needs an approved booking of mine), and delete.
      await setStatus(attacker, own, "approved");
      await page.reload();
      await forgeOnSubmit(page, "form", { id: approvedForeign });
      await page.getByRole("button", { name: "Cancel booking" }).click();
      await page.getByRole("alertdialog").getByRole("button", { name: "Cancel booking" }).click();
      await expect(page.getByTestId("booking-action-error")).toBeVisible();
      expect(await statusInDb(victim, approvedForeign)).toBe("approved");

      await page.reload();
      await forgeOnSubmit(page, "form", { id: foreign });
      await page.getByRole("button", { name: /^Delete booking of / }).click();
      await page.getByRole("alertdialog").getByRole("button", { name: "Delete booking" }).click();
      await expect(page.getByTestId("booking-action-error")).toBeVisible();
      expect(await statusInDb(victim, foreign), "the victim's booking still exists").toBe("pending");
      expect(await statusInDb(attacker, own), "and mine was not touched either").toBe("approved");

      // A malformed id gets the same friendly message.
      await page.reload();
      await forgeOnSubmit(page, "form", { id: "not-a-uuid" });
      await page.getByRole("button", { name: /^Delete booking of / }).click();
      await page.getByRole("alertdialog").getByRole("button", { name: "Delete booking" }).click();
      await expect(page.getByTestId("booking-action-error")).toHaveText("That booking could not be found.");
    } finally {
      await mine.cleanup();
      await theirs.cleanup();
    }
  });
});

// ---------------------------------------------------------------------------
// Locked items (Q9)
// ---------------------------------------------------------------------------
test.describe("locked items are read-only", () => {
  test("after a downgrade the booking shows an explanation and no action buttons; a stale page's click is refused with the same explanation", async ({ page, context }) => {
    const owner = await newOwner();
    await setPlan(owner.id, "pro");
    // Two workspaces with a resource each; the first holds the bookings.
    const a = await makeWorkspace(owner);
    await makeWorkspace(owner);
    try {
      const date = day(3);
      const pendingId = await book(a.resourceId, iso(date, 9), { name: `Locked pending ${tag()}` });
      const approvedId = await book(a.resourceId, iso(date, 10), { name: `Locked approved ${tag()}` });
      await setStatus(owner, approvedId, "approved");
      await logIn(page, owner);

      // A page opened BEFORE the downgrade (so it still shows buttons).
      await page.goto(`/dashboard/bookings/${pendingId}`);
      await expect(page.getByRole("button", { name: "Approve", exact: true })).toBeVisible();

      await setPlan(owner.id, "free"); // two workspaces on Free: both are locked until the owner chooses (A18)
      const locked = await owner.client.from("workspaces").select("id, is_locked").eq("id", a.workspaceId).single();
      expect(locked.data?.is_locked, "the workspace is locked").toBe(true);

      // The stale page: its click is refused, nothing changes, and the owner is told why.
      await page.getByRole("button", { name: "Approve", exact: true }).click();
      await expect(page.getByTestId("booking-action-error")).toContainText("read-only because its resource or workspace is locked");
      expect(await statusInDb(owner, pendingId)).toBe("pending");

      // A fresh page: no action buttons at all, and the explanation is shown.
      for (const id of [pendingId, approvedId]) {
        await page.goto(`/dashboard/bookings/${id}`);
        await expect(page.getByTestId("booking-locked-notice")).toContainText("read-only");
        await expect(page.getByText("Locked (plan limit)")).toBeVisible();
        await expect(page.getByRole("button", { name: "Approve", exact: true })).toHaveCount(0);
        await expect(page.getByRole("button", { name: "Reject", exact: true })).toHaveCount(0);
        await expect(page.getByRole("button", { name: "Cancel booking" })).toHaveCount(0);
        await expect(page.getByRole("button", { name: /^Delete booking of / })).toHaveCount(0);
      }
      // Still visible in the list, and the database refuses a delete on its own (Q9).
      await page.goto("/dashboard/bookings");
      await expect(rowFor(page, "Locked pending")).toHaveCount(1);
      const refused = await owner.client.from("bookings").delete().eq("id", pendingId).select("id");
      expect(refused.data ?? []).toEqual([]);
      expect(await statusInDb(owner, pendingId)).toBe("pending");
    } finally {
      await context.clearCookies();
      await a.cleanup();
    }
  });
});

// ---------------------------------------------------------------------------
// Notifications and the overview (NOTIF-02, DASH-03, DASH-04, DASH-06, D15, D19, D25)
// ---------------------------------------------------------------------------
test.describe("notifications and the overview", () => {
  test("the badge counts only my pending requests, goes up with a new request and down with every decision and delete", async ({ page }) => {
    const owner = await newOwner(); // its own owner: the count must be exact
    const stranger = await secondOwner();
    await setPlan(owner.id, "pro");
    const fx = await makeWorkspace(owner);
    const foreign = await makeWorkspace(stranger);
    try {
      const date = day(3);
      const a = await book(fx.resourceId, iso(date, 9), { name: `Badge A ${tag()}` });
      const b = await book(fx.resourceId, iso(date, 10), { name: `Badge B ${tag()}` });
      const c = await book(fx.resourceId, iso(date, 11), { name: `Badge C ${tag()}` });
      await book(foreign.resourceId, iso(date, 9)); // someone else's pending request is not mine
      await logIn(page, owner);

      const expectCount = async (n: number) => {
        await page.goto("/dashboard");
        await expect(bell(page)).toHaveAttribute("aria-label", n === 0 ? "Notifications: no pending booking requests" : `Notifications: ${n} pending booking request${n === 1 ? "" : "s"}`);
        if (n === 0) await expect(page.getByTestId("nav-pending-count")).toHaveCount(0);
        else await expect(page.getByTestId("nav-pending-count")).toContainText(String(n));
        // The same number on every dashboard page (the header and the menu).
        await page.goto("/dashboard/workspaces");
        await expect(bell(page)).toHaveAttribute("aria-label", n === 0 ? "Notifications: no pending booking requests" : `Notifications: ${n} pending booking request${n === 1 ? "" : "s"}`);
      };
      await expectCount(3);
      await book(fx.resourceId, iso(date, 12), { name: `Badge D ${tag()}` }); // a new request raises it on the next load
      await expectCount(4);
      await setStatus(owner, a, "approved");
      await expectCount(3);
      await setStatus(owner, b, "rejected");
      await expectCount(2);
      await owner.client.from("bookings").delete().eq("id", c); // deleting a pending request lowers it
      await expectCount(1);
      // The bell leads to the pending requests.
      await page.goto("/dashboard");
      await bell(page).click();
      await expect(page).toHaveURL(/status=pending/);
      await expect(page.getByRole("group", { name: "Filter by status" }).getByRole("button", { name: "pending" })).toHaveAttribute("aria-pressed", "true");
    } finally {
      await fx.cleanup();
      await foreign.cleanup();
    }
  });

  test("the overview shows real numbers, 'Recent activity' with the 5 newest requests, and the pending requests needing a decision", async ({ page }) => {
    const owner = await newOwner();
    await setPlan(owner.id, "pro");
    const fx = await makeWorkspace(owner);
    try {
      const date = day(3);
      const ids: string[] = [];
      for (let i = 0; i < 7; i++) ids.push(await book(fx.resourceId, iso(date, 8 + i), { name: `Act ${i} ${tag()}` }));
      await setStatus(owner, ids[0], "approved");
      await setStatus(owner, ids[1], "approved");
      await setStatus(owner, ids[2], "rejected");
      await logIn(page, owner);
      await page.goto("/dashboard");
      await expect(page.getByTestId("overview-total-bookings")).toHaveText("7");
      await expect(page.getByTestId("overview-pending")).toHaveText("4");
      await expect(page.getByTestId("overview-approved-month")).toHaveText("2");
      // DASH-04: separate counts of pending, approved and rejected.
      await expect(page.getByTestId("overview-status-pending")).toHaveText("4");
      await expect(page.getByTestId("overview-status-approved")).toHaveText("2");
      await expect(page.getByTestId("overview-status-rejected")).toHaveText("1");
      await expect(page.getByTestId("overview-usage")).toHaveText("7 of 1,000");
      await expect(page.getByTestId("overview-limit-prompt")).toHaveCount(0);

      const recent = page.getByTestId("recent-list").getByRole("listitem");
      await expect(recent).toHaveCount(5); // D25
      await expect(recent.nth(0)).toContainText("Act 6");
      await expect(recent.nth(4)).toContainText("Act 2");
      await expect(recent.nth(2)).toContainText(fx.resourceName);
      await expect(recent.nth(4)).toContainText("Rejected");
      await expect(page.getByTestId("recent-list").getByRole("link", { name: /Act 6/ })).toHaveAttribute("href", `/dashboard/bookings/${ids[6]}`);
      // Pending requests, the longest waiting first.
      const waiting = page.getByTestId("pending-list").getByRole("listitem");
      await expect(waiting).toHaveCount(4);
      await expect(waiting.nth(0)).toContainText("Act 3");
      await page.getByTestId("pending-list").getByRole("link", { name: /Act 3/ }).click();
      await expect(page).toHaveURL(`/dashboard/bookings/${ids[3]}`);
    } finally {
      await fx.cleanup();
    }
  });

  test("a new owner sees zeros (not errors) and friendly empty lists", async ({ page }) => {
    const owner = await newOwner();
    await logIn(page, owner);
    await page.goto("/dashboard");
    await expect(page.getByTestId("overview-total-bookings")).toHaveText("0");
    await expect(page.getByTestId("overview-pending")).toHaveText("0");
    await expect(page.getByTestId("overview-approved-month")).toHaveText("0");
    await expect(page.getByTestId("overview-usage")).toHaveText("0 of 100");
    await expect(page.getByTestId("recent-empty")).toBeVisible();
    await expect(page.getByTestId("pending-empty")).toBeVisible();
  });

  test("near the monthly limit a Free owner sees an upgrade prompt, and deleted requests still count (D19)", async ({ page }) => {
    const owner = await newOwner(); // Free: 100 requests a month
    const fx = await makeWorkspace(owner);
    try {
      expect((await service.from("subscriptions").select("plan").eq("owner_id", owner.id).single()).data?.plan).toBe("free");
      await logIn(page, owner);
      const ids = await bookMany(fx.resourceId, 79, (i) => `Limit ${i}`);
      await page.goto("/dashboard");
      await expect(page.getByTestId("overview-usage")).toHaveText("79 of 100");
      await expect(page.getByTestId("overview-limit-prompt")).toHaveCount(0);
      ids.push(await book(fx.resourceId, iso(day(6), 5), { name: "Limit 80" }));
      await page.goto("/dashboard");
      await expect(page.getByTestId("overview-usage")).toHaveText("80 of 100");
      const prompt = page.getByTestId("overview-limit-prompt");
      await expect(prompt).toContainText("close to this month's limit");
      await expect(prompt.getByRole("link", { name: "See Pro" })).toHaveAttribute("href", "/dashboard/billing");
      // Deleting every request does not bring the count down.
      expect((await owner.client.from("bookings").delete().in("id", ids).select("id")).data).toHaveLength(80);
      await page.goto("/dashboard");
      await expect(page.getByTestId("overview-total-bookings")).toHaveText("0");
      await expect(page.getByTestId("overview-usage")).toHaveText("80 of 100");
      await expect(page.getByTestId("overview-limit-prompt")).toBeVisible();
    } finally {
      await fx.cleanup();
    }
  });
});
