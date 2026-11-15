import { expect, test, type Browser, type Page } from "@playwright/test";
import { createHash, randomBytes } from "node:crypto";
import { serviceClient } from "../db/helpers";
import { addDaysToDate, todayInZone } from "../../src/lib/time/slots";
import { LOGGED_OUT } from "./owner";
import { cleanupOwners, newOwner, PNG_BYTES, setPlan, sharedPerFile, tag, type TestOwner } from "./owners";

// Public booking (Phase 11: PUB-01 to PUB-07, NOTIF-01, NOTIF-03, SEC-06, D19, D21, D22).
// Real paths only: a visitor is a browser with NO login; owners are real logged-in API
// sessions (RLS applies); the server key is used only to read back what the database holds.
//
// The rate limit is 5 attempts per 10 minutes per visitor per workspace. Every test makes
// its OWN workspace (created and deleted with a shared Pro owner per worker) and every
// visitor gets its own made-up x-forwarded-for address, so tests never share an allowance.

test.use({ storageState: LOGGED_OUT });
test.afterAll(cleanupOwners);

const service = serviceClient();

function sharedOwner(): Promise<TestOwner> {
  return sharedPerFile("pro", async () => {
    const owner = await newOwner();
    await setPlan(owner.id, "pro");
    return owner;
  });
}

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------
interface ResourceSpec {
  name?: string;
  slot?: number;
  capacity?: number;
  description?: string;
  /** null = no opening hours at all */
  hours?: [string, string] | null;
  available?: boolean;
}
interface Fixture {
  workspaceId: string;
  slug: string;
  name: string;
  description: string;
  resources: { id: string; name: string }[];
  cleanup: () => Promise<void>;
}

async function makeWorkspace(owner: TestOwner, specs: ResourceSpec[] = [{}], zone = "UTC"): Promise<Fixture> {
  const t = tag();
  const name = `Studio ${t}`;
  const description = `Public text ${t}`;
  const slug = `ws-${t}-${tag()}`;
  const ws = await owner.client
    .from("workspaces")
    .insert({ owner_id: owner.id, name, description, slug, time_zone: zone })
    .select("id")
    .single();
  if (ws.error) throw new Error(`workspace insert failed: ${ws.error.message}`);

  const resources: Fixture["resources"] = [];
  for (const [i, spec] of specs.entries()) {
    const resourceName = spec.name ?? `Room ${i + 1} ${t}`;
    const res = await owner.client
      .from("resources")
      .insert({
        workspace_id: ws.data.id,
        owner_id: owner.id,
        name: resourceName,
        description: spec.description ?? null,
        slot_minutes: spec.slot ?? 60,
        capacity: spec.capacity ?? 3,
        is_available: spec.available ?? true,
      })
      .select("id")
      .single();
    if (res.error) throw new Error(`resource insert failed: ${res.error.message}`);
    const hours = spec.hours === undefined ? (["00:00", "24:00"] as [string, string]) : spec.hours;
    if (hours) {
      const rows = [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ resource_id: res.data.id, weekday, opens_at: hours[0], closes_at: hours[1] }));
      const av = await owner.client.from("resource_availability").insert(rows);
      if (av.error) throw new Error(`availability insert failed: ${av.error.message}`);
    }
    resources.push({ id: res.data.id, name: resourceName });
  }
  return {
    workspaceId: ws.data.id,
    slug,
    name,
    description,
    resources,
    cleanup: async () => {
      await owner.client.from("workspaces").delete().eq("id", ws.data.id);
    },
  };
}

/** A calendar day in the (UTC) workspace zone, n days from today. */
const day = (n: number) => addDaysToDate(todayInZone("UTC"), n);

const rnd = () => 1 + Math.floor(Math.random() * 254);
const fakeAddress = () => `10.${rnd()}.${rnd()}.${rnd()}`;

async function visitor(browser: Browser, baseURL: string, size = { width: 1280, height: 800 }) {
  const context = await browser.newContext({
    baseURL,
    viewport: size,
    extraHTTPHeaders: { "x-forwarded-for": fakeAddress() },
    permissions: ["clipboard-read", "clipboard-write"],
  });
  const page = await context.newPage();
  return { context, page };
}

const slotButton = (page: Page, from: string) => page.getByRole("button", { name: new RegExp(`^${from} to `) });

async function pick(page: Page, resourceName: string | null, date: string, time: string) {
  if (resourceName) await page.getByRole("button", { name: resourceName }).click();
  await page.getByLabel("Date", { exact: true }).fill(date);
  await slotButton(page, time).click();
}

async function details(page: Page, who: { name: string; email: string; people?: string; phone?: string; note?: string }) {
  await page.getByLabel("Name", { exact: true }).fill(who.name);
  await page.getByLabel("Email").fill(who.email);
  if (who.people) await page.getByLabel("Number of people").fill(who.people);
  if (who.phone) await page.getByLabel("Phone").fill(who.phone);
  if (who.note) await page.getByLabel("Note").fill(who.note);
}

const submit = (page: Page) => page.getByRole("button", { name: "Request booking" });
const CODE = /\/booking\/([A-Za-z0-9_-]{43})(\?|$)/;
const codeFrom = (page: Page) => CODE.exec(page.url())![1];

async function expectNotFound(page: Page) {
  await expect(page.getByRole("heading", { level: 1, name: "Page not found" })).toBeVisible();
}

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

// ---------------------------------------------------------------------------
// The whole flow, on a phone and on a desktop
// ---------------------------------------------------------------------------
for (const size of [
  { name: "phone 375", width: 375, height: 812 },
  { name: "desktop 1280", width: 1280, height: 800 },
]) {
  test(`full booking flow on a ${size.name}: pick, fill in, send, save the link, check the status`, async ({ browser, baseURL }) => {
    const owner = await sharedOwner();
    const fx = await makeWorkspace(owner, [{ capacity: 3, slot: 60 }]);
    const { context, page } = await visitor(browser, baseURL!, size);
    try {
      // D21: the main content shows within about 3 seconds.
      const started = Date.now();
      await page.goto(`/book/${fx.slug}`);
      await expect(page.getByTestId("booking-flow")).toBeVisible();
      expect(Date.now() - started, "main content within 3 s (D21)").toBeLessThan(3000);

      await expect(page.getByRole("heading", { level: 1 })).toHaveText(fx.name);
      await expect(page.getByText(fx.description)).toBeVisible();
      // WORK-04: the zone is named.
      await expect(page.getByTestId("zone-note")).toHaveText("Times are shown in UTC.");
      await expectNoOverflow(page);
      await expectNamedControls(page);

      // Sending an empty form: friendly messages next to the fields, focus on the first problem, nothing saved.
      await submit(page).click();
      await expect(page.getByText("Choose a time first.")).toBeVisible();
      await expect(page.getByText("Enter your name (up to 100 characters).")).toBeVisible();
      await expect(page.getByText("Enter a valid email address.")).toBeVisible();
      await expect(page.locator("#slot-group")).toBeFocused();

      // More people than the capacity: refused next to the field, nothing saved (PUB-04).
      await pick(page, null, day(3), "10:00");
      await details(page, { name: "Ada Lovelace", email: `ada-${tag()}@example.com`, people: "4" });
      await submit(page).click();
      await expect(page.getByText("Enter a number of people from 1 to 3.")).toBeVisible();
      await expect(page.getByLabel("Number of people")).toBeFocused();
      await expect(page).not.toHaveURL(CODE);
      expect((await service.from("bookings").select("id").eq("resource_id", fx.resources[0].id)).data).toHaveLength(0);

      // The chosen time and the zone are summarised before sending.
      await expect(page.getByTestId("booking-summary")).toContainText("10:00 to 11:00 (UTC)");
      await page.getByLabel("Number of people").fill("2");
      await page.getByLabel("Phone").fill("+44 20 7946 0958");
      await page.getByLabel("Note").fill("Window seat please");
      await submit(page).click();

      // The confirmation: success message once, the private link with a copy button.
      await page.waitForURL(CODE);
      const code = codeFrom(page);
      await expect(page.getByTestId("success-message")).toContainText("Your request was sent");
      const panel = page.getByTestId("status-link-panel");
      await expect(panel).toContainText("Save this link");
      const field = panel.getByLabel("Your private status link");
      await expect(field).toHaveValue(new RegExp(`/booking/${code}$`));
      await panel.getByRole("button", { name: "Copy link" }).click();
      await expect(panel.getByRole("button", { name: "Copied" })).toBeVisible();
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(await field.inputValue());
      await expect(page.getByText("Pending", { exact: true })).toBeVisible();
      const facts = page.locator("dl");
      await expect(facts).toContainText("10:00 to 11:00 (UTC)");
      await expect(facts).toContainText("Ada Lovelace");
      await expect(facts).toContainText(fx.resources[0].name);
      await expectNoOverflow(page);

      // The database holds exactly what was sent: pending, the hash of the code (never the code).
      // (The server key may read only some columns of bookings, ISO-03; the owner's own session reads the rest.)
      const rows = await service.from("bookings").select("id, status, starts_at, ends_at, status_token_hash").eq("resource_id", fx.resources[0].id);
      expect(rows.error).toBeNull();
      expect(rows.data).toHaveLength(1);
      const full = await owner.client.from("bookings").select("visitor_phone, note, attendees, visitor_name").eq("id", rows.data![0].id).single();
      expect(full.data).toMatchObject({ visitor_phone: "+44 20 7946 0958", note: "Window seat please", attendees: 2, visitor_name: "Ada Lovelace" });
      expect(rows.data![0]).toMatchObject({ status: "pending" });
      expect(new Date(rows.data![0].starts_at).toISOString()).toBe(`${day(3)}T10:00:00.000Z`);
      expect(rows.data![0].status_token_hash).toBe(`\\x${createHash("sha256").update(code).digest("hex")}`);

      // The link is shown ONCE: a refresh shows the plain status page, same facts, no panel.
      await page.reload();
      await expect(page.getByRole("heading", { level: 1, name: "Your booking request" })).toBeVisible();
      await expect(page.getByTestId("success-message")).toHaveCount(0);
      await expect(page.getByTestId("status-link-panel")).toHaveCount(0);
      await expect(page.getByTestId("status-meaning")).toContainText("Waiting for the owner");
      await expect(page.locator("dl")).toContainText("Ada Lovelace");
      // Refreshing never makes a second booking (PUB-07).
      expect((await service.from("bookings").select("id").eq("resource_id", fx.resources[0].id)).data).toHaveLength(1);

      // The owner decides; the visitor's page follows (NOTIF-03).
      const id = (await service.from("bookings").select("id").eq("resource_id", fx.resources[0].id).single()).data!.id;
      const approve = await owner.client.from("bookings").update({ status: "approved" }).eq("id", id).select("status");
      expect(approve.error).toBeNull();
      await page.reload();
      await expect(page.getByText("Approved", { exact: true }).first()).toBeVisible();
      await expect(page.getByTestId("status-meaning")).toContainText("confirmed");
      const cancel = await owner.client.from("bookings").update({ status: "cancelled" }).eq("id", id).select("status");
      expect(cancel.error).toBeNull();
      await page.reload();
      await expect(page.getByText("Cancelled", { exact: true }).first()).toBeVisible();

      // Deleted: "not found" (NOTIF-03).
      expect((await owner.client.from("bookings").delete().eq("id", id).select("id")).data).toHaveLength(1);
      await page.reload();
      await expectNotFound(page);
    } finally {
      await context.close();
      await fx.cleanup();
    }
  });
}

test("tablet 768: the page and the status page fit the screen and have a sound structure", async ({ browser, baseURL }) => {
  const owner = await sharedOwner();
  const fx = await makeWorkspace(owner, [{ name: `Desk ${tag()}` }, { name: `Room ${tag()}` }]);
  const { context, page } = await visitor(browser, baseURL!, { width: 768, height: 1024 });
  try {
    await page.goto(`/book/${fx.slug}`);
    await expect(page.getByTestId("booking-flow")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    await expect(page.locator("main#main-content")).toHaveCount(1);
    const levels = await page.evaluate(() => Array.from(document.querySelectorAll("h1, h2, h3, h4")).map((h) => Number(h.tagName.slice(1))));
    levels.forEach((l, i) => i > 0 && expect(l, `heading order ${levels}`).toBeLessThanOrEqual(levels[i - 1] + 1));
    await expectNoOverflow(page);
    await expectNamedControls(page);

    await pick(page, fx.resources[1].name, day(2), "09:00");
    await details(page, { name: "Tablet Tester", email: `t-${tag()}@example.com` });
    await submit(page).click();
    await page.waitForURL(CODE);
    await expectNoOverflow(page);
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    await expectNamedControls(page);
  } finally {
    await context.close();
    await fx.cleanup();
  }
});

// ---------------------------------------------------------------------------
// The status page
// ---------------------------------------------------------------------------
test("status page: hidden from search engines, never cached, never passes its address on; unknown or malformed codes are 'not found'", async ({ browser, baseURL }) => {
  const owner = await sharedOwner();
  const fx = await makeWorkspace(owner);
  const { context, page } = await visitor(browser, baseURL!);
  try {
    await page.goto(`/book/${fx.slug}`);
    await pick(page, null, day(4), "11:00");
    await details(page, { name: "Header Tester", email: `h-${tag()}@example.com` });
    await submit(page).click();
    await page.waitForURL(CODE);
    const code = codeFrom(page);

    const response = await page.goto(`/booking/${code}`);
    const headers = response!.headers();
    expect(headers["cache-control"]).toMatch(/no-store/);
    expect(headers["referrer-policy"]).toBe("no-referrer");
    expect(headers["x-robots-tag"]).toMatch(/noindex/);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
    await expect(page.locator('meta[name="referrer"]')).toHaveAttribute("content", "no-referrer");

    // A wrong code of the right shape, a code that is one character off, and junk: all "not found".
    const wrong = "A".repeat(43);
    for (const bad of [wrong, `${code.slice(0, 42)}${code[42] === "A" ? "B" : "A"}`, "sample-code", "x", `${code}extra`]) {
      await page.goto(`/booking/${bad}`);
      await expectNotFound(page);
      await expect(page.getByText("Your booking request")).toHaveCount(0);
    }
  } finally {
    await context.close();
    await fx.cleanup();
  }
});

// ---------------------------------------------------------------------------
// What is (not) on the public page
// ---------------------------------------------------------------------------
test("missing workspace: 'not found'; a malformed address too", async ({ browser, baseURL }) => {
  const { context, page } = await visitor(browser, baseURL!);
  try {
    for (const path of [`/book/no-such-${tag()}`, "/book/Not_Valid", "/book/a"]) {
      await page.goto(path);
      await expectNotFound(page);
    }
  } finally {
    await context.close();
  }
});

test("locked workspaces (after a downgrade) are 'not found' and cannot be booked (BILL-09)", async ({ browser, baseURL }) => {
  const owner = await newOwner();
  await setPlan(owner.id, "pro");
  const a = await makeWorkspace(owner);
  const b = await makeWorkspace(owner);
  const { context, page } = await visitor(browser, baseURL!);
  try {
    // While Pro and unlocked, both pages work.
    await page.goto(`/book/${a.slug}`);
    await expect(page.getByTestId("booking-flow")).toBeVisible();

    await setPlan(owner.id, "free"); // two workspaces on Free: the safe state locks both until the owner chooses (A18)
    const locked = await service.from("workspaces").select("id, is_locked").in("id", [a.workspaceId, b.workspaceId]);
    expect(locked.data?.every((w) => w.is_locked)).toBe(true);
    for (const fx of [a, b]) {
      await page.goto(`/book/${fx.slug}`);
      await expectNotFound(page);
      await expect(page.getByText(fx.name)).toHaveCount(0);
    }
    // The database refuses it as well (the page is not the only guard).
    const refused = await service.rpc("submit_booking", {
      p_resource_id: a.resources[0].id,
      p_starts_at: `${day(3)}T10:00:00.000Z`,
      p_visitor_name: "X",
      p_visitor_email: "x@example.com",
      p_visitor_phone: null as unknown as string,
      p_note: null as unknown as string,
      p_attendees: 1,
      p_status_token_hash: `\\x${randomBytes(32).toString("hex")}`,
    });
    expect(refused.error?.message).toBe("not_bookable");
  } finally {
    await context.close();
  }
});

test("a resource that is not available is hidden; a workspace with none shows a friendly message (PUB-02)", async ({ browser, baseURL }) => {
  const owner = await sharedOwner();
  const hiddenName = `Hidden ${tag()}`;
  const shownName = `Shown ${tag()}`;
  const fx = await makeWorkspace(owner, [{ name: shownName, description: "Shown description" }, { name: hiddenName, available: false }]);
  const empty = await makeWorkspace(owner, [{ available: false }]);
  const { context, page } = await visitor(browser, baseURL!);
  try {
    await page.goto(`/book/${fx.slug}`);
    await expect(page.getByRole("button", { name: shownName })).toBeVisible();
    await expect(page.getByText("Shown description")).toBeVisible();
    await expect(page.getByText("60 minutes per booking · up to 3 people").first()).toBeVisible();
    expect(await page.content()).not.toContain(hiddenName);
    await expect(page.getByRole("button", { name: hiddenName })).toHaveCount(0);

    await page.goto(`/book/${empty.slug}`);
    await expect(page.getByTestId("no-resources")).toBeVisible();
    await expect(page.getByTestId("booking-flow")).toHaveCount(0);
  } finally {
    await context.close();
    await fx.cleanup();
    await empty.cleanup();
  }
});

test("only today up to 90 days ahead can be chosen; times that already started are not offered", async ({ browser, baseURL }) => {
  const owner = await sharedOwner();
  const fx = await makeWorkspace(owner, [{ slot: 60 }]);
  const { context, page } = await visitor(browser, baseURL!);
  try {
    await page.goto(`/book/${fx.slug}`);
    const date = page.getByLabel("Date", { exact: true });
    await expect(date).toHaveAttribute("min", day(0));
    await expect(date).toHaveAttribute("max", day(90));

    // Too far: refused with a message, no times shown.
    await date.fill(day(91));
    await expect(page.getByText("Choose a date from today up to 90 days ahead.")).toBeVisible();
    await expect(page.getByRole("list", { name: "Free times" })).toHaveCount(0);
    // Yesterday: the same.
    await date.fill(day(-1));
    await expect(page.getByText("Choose a date from today up to 90 days ahead.")).toBeVisible();
    await expect(page.getByRole("list", { name: "Free times" })).toHaveCount(0);

    // The last allowed day has times.
    await date.fill(day(90));
    await expect(slotButton(page, "10:00")).toBeVisible();
    await expect(page.getByText("Choose a date from today up to 90 days ahead.")).toHaveCount(0);

    // Today: only times after "now" (the server's clock, in the workspace's zone, UTC here).
    await date.fill(day(0));
    await expect(page.getByTestId("slot-status")).not.toHaveText("Loading free times…");
    const now = new Date();
    const nowMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
    const labels = await page.getByRole("list", { name: "Free times" }).getByRole("button").allTextContents();
    for (const label of labels) {
      const [h, m] = label.slice(0, 5).split(":").map(Number);
      expect(h * 60 + m, `${label} must not already have started`).toBeGreaterThan(nowMinutes - 2);
    }
  } finally {
    await context.close();
    await fx.cleanup();
  }
});

// ---------------------------------------------------------------------------
// Privacy
// ---------------------------------------------------------------------------
test("the page HTML holds no other visitor's details and no owner data; a booked time is not offered again", async ({ browser, baseURL }) => {
  const owner = await sharedOwner();
  const fx = await makeWorkspace(owner, [{ slot: 60, capacity: 4 }]);
  // The resource HAS an image (Phase 11 review finding 2: the first version of this test had none, so it
  // missed that the owner's id was part of the public image address).
  const imagePath = `${fx.resources[0].id}/${crypto.randomUUID()}.png`;
  expect((await serviceClient().storage.from("resource-images").upload(imagePath, PNG_BYTES, { contentType: "image/png" })).error).toBeNull();
  expect((await serviceClient().rpc("set_resource_image", { p_owner_id: owner.id, p_resource_id: fx.resources[0].id, p_path: imagePath })).error).toBeNull();
  const a = await visitor(browser, baseURL!);
  const b = await visitor(browser, baseURL!);
  const secrets = {
    name: `Quillfeather${tag()}`,
    email: `quill-${tag()}@example.com`,
    phone: "+1 555 010 4242",
    note: `private-note-${tag()}`,
  };
  try {
    await a.page.goto(`/book/${fx.slug}`);
    await pick(a.page, null, day(5), "14:00");
    await details(a.page, { name: secrets.name, email: secrets.email, people: "2", phone: secrets.phone, note: secrets.note });
    await submit(a.page).click();
    await a.page.waitForURL(CODE);
    // The HTML the SERVER sends (after a client-side redirect the browser keeps the old page hidden in its own DOM).
    const statusHtml = await (await a.context.request.get(a.page.url())).text();
    expect(statusHtml).toContain(secrets.name); // the visitor's OWN name is allowed on their own status page
    for (const hidden of [secrets.email, secrets.phone, secrets.note, owner.email, owner.id]) {
      expect(statusHtml, "status page").not.toContain(hidden);
    }

    // Another visitor looks at the same workspace and the same day. Everything the server sends is checked.
    const bodies: string[] = [];
    b.page.on("response", async (response) => {
      try {
        if (response.url().includes(`/book/${fx.slug}`) || response.request().headers()["next-action"]) bodies.push(await response.text());
      } catch {
        // a response without a readable body
      }
    });
    await b.page.goto(`/book/${fx.slug}`);
    await b.page.getByLabel("Date", { exact: true }).fill(day(5));
    await expect(slotButton(b.page, "13:00")).toBeVisible();
    await expect(slotButton(b.page, "15:00")).toBeVisible();
    await expect(slotButton(b.page, "14:00")).toHaveCount(0); // taken by A (pending holds the slot, D10)
    const html = await (await b.context.request.get(`/book/${fx.slug}`)).text();
    expect(html, "the page shows the image, by an address without the owner id").toContain(imagePath);
    for (const hidden of [secrets.name, secrets.email, secrets.phone, secrets.note, owner.email, owner.id, "visitor_email", "owner_id", "status_token"]) {
      expect(html, `page HTML: ${hidden}`).not.toContain(hidden);
      for (const body of bodies) expect(body, `server answers: ${hidden}`).not.toContain(hidden);
    }
    expect(bodies.length, "the checked responses include the page and the slot answer").toBeGreaterThanOrEqual(2);
  } finally {
    await a.context.close();
    await b.context.close();
    await fx.cleanup();
  }
});

// ---------------------------------------------------------------------------
// Limits and races
// ---------------------------------------------------------------------------
test("two browsers send the same time together: exactly one booking, the other is told it was just taken", async ({ browser, baseURL }) => {
  test.setTimeout(120_000);
  const owner = await sharedOwner();
  const fx = await makeWorkspace(owner, [{ slot: 60, capacity: 2 }]);
  try {
    for (const hour of ["09:00", "10:00", "11:00"]) {
      const a = await visitor(browser, baseURL!);
      const b = await visitor(browser, baseURL!);
      try {
        for (const [who, v] of [["A", a], ["B", b]] as const) {
          await v.page.goto(`/book/${fx.slug}`);
          await pick(v.page, null, day(6), hour);
          await details(v.page, { name: `Racer ${who}`, email: `racer-${who}-${tag()}@example.com` });
        }
        await Promise.all([submit(a.page).click(), submit(b.page).click()]);

        // One lands on its status page; the other stays on the form with the friendly message.
        await expect.poll(() => [a.page, b.page].filter((p) => CODE.test(p.url())).length, { timeout: 30_000 }).toBe(1);
        const loser = CODE.test(a.page.url()) ? b.page : a.page;
        await expect(loser.getByTestId("booking-error")).toContainText("just taken");
        await expect(loser).not.toHaveURL(CODE);
        // The loser's list is refreshed and the taken time is gone, so another can be picked.
        await expect(slotButton(loser, hour)).toHaveCount(0);

        const held = await service.from("bookings").select("id").eq("resource_id", fx.resources[0].id).eq("starts_at", `${day(6)}T${hour}:00.000Z`);
        expect(held.data, `${hour}: exactly one booking`).toHaveLength(1);
      } finally {
        await a.context.close();
        await b.context.close();
      }
    }
    expect((await service.from("bookings").select("id").eq("resource_id", fx.resources[0].id)).data).toHaveLength(3);
  } finally {
    await fx.cleanup();
  }
});

test("the 6th request in 10 minutes from one visitor to one workspace is refused; another workspace is unaffected", async ({ browser, baseURL }) => {
  test.setTimeout(180_000);
  const owner = await sharedOwner();
  const fx = await makeWorkspace(owner, [{ slot: 60, capacity: 2 }]);
  const other = await makeWorkspace(owner, [{ slot: 60, capacity: 2 }]);
  const { context, page } = await visitor(browser, baseURL!);
  try {
    for (const hour of ["08:00", "09:00", "10:00", "11:00", "12:00"]) {
      await page.goto(`/book/${fx.slug}`);
      await pick(page, null, day(7), hour);
      await details(page, { name: "Busy Visitor", email: `busy-${tag()}@example.com` });
      await submit(page).click();
      await page.waitForURL(CODE);
    }
    expect((await service.from("bookings").select("id").eq("resource_id", fx.resources[0].id)).data).toHaveLength(5);

    await page.goto(`/book/${fx.slug}`);
    await pick(page, null, day(7), "13:00");
    await details(page, { name: "Busy Visitor", email: `busy-${tag()}@example.com` });
    await submit(page).click();
    await expect(page.getByTestId("booking-error")).toContainText("Too many requests. Please try again in a few minutes.");
    await expect(page).not.toHaveURL(CODE);
    expect((await service.from("bookings").select("id").eq("resource_id", fx.resources[0].id)).data, "the 6th created nothing").toHaveLength(5);

    // Refused attempts count too: still refused.
    await submit(page).click();
    await expect(page.getByTestId("booking-error")).toContainText("Too many requests");

    // The same visitor, another workspace: its own allowance (D24).
    await page.goto(`/book/${other.slug}`);
    await pick(page, null, day(7), "08:00");
    await details(page, { name: "Busy Visitor", email: `busy-${tag()}@example.com` });
    await submit(page).click();
    await page.waitForURL(CODE);
  } finally {
    await context.close();
    await fx.cleanup();
    await other.cleanup();
  }
});

test("an owner who reached the monthly limit: the page says so and shows no form (D19); deleting bookings does not lower the count", async ({ browser, baseURL }) => {
  test.setTimeout(240_000);
  const owner = await newOwner(); // Free: 100 requests a month
  const fx = await makeWorkspace(owner, [{ slot: 60, capacity: 2 }]);
  const { context, page } = await visitor(browser, baseURL!);
  try {
    // 100 real submissions through the database function, as our server does, 10 at a time.
    const slots = Array.from({ length: 100 }, (_, i) => `${day(10 + Math.floor(i / 24))}T${String(i % 24).padStart(2, "0")}:00:00.000Z`);
    for (let i = 0; i < slots.length; i += 10) {
      const results = await Promise.all(
        slots.slice(i, i + 10).map((startsAt) =>
          service.rpc("submit_booking", {
            p_resource_id: fx.resources[0].id,
            p_starts_at: startsAt,
            p_visitor_name: "Load Test",
            p_visitor_email: "load@example.com",
            p_visitor_phone: null as unknown as string,
            p_note: null as unknown as string,
            p_attendees: 1,
            p_status_token_hash: `\\x${randomBytes(32).toString("hex")}`,
          }),
        ),
      );
      for (const r of results) expect(r.error, "a booking under the limit succeeds").toBeNull();
    }

    await page.goto(`/book/${fx.slug}`);
    await expect(page.getByTestId("not-accepting")).toContainText("not accepting booking requests right now");
    await expect(page.getByTestId("booking-flow")).toHaveCount(0);
    await expect(page.getByLabel("Name", { exact: true })).toHaveCount(0);

    // Deleting bookings does not lower the count (D19): still not accepting.
    expect((await owner.client.from("bookings").delete().eq("resource_id", fx.resources[0].id).select("id")).data).toHaveLength(100);
    await page.reload();
    await expect(page.getByTestId("not-accepting")).toBeVisible();
  } finally {
    await context.close();
  }
});

test("after a successful booking, going Back shows no false error message (the redirect is not a failure)", async ({ browser, baseURL }) => {
  const owner = await sharedOwner();
  const fx = await makeWorkspace(owner);
  const { context, page } = await visitor(browser, baseURL!);
  try {
    await page.goto(`/book/${fx.slug}`);
    await pick(page, null, day(8), "15:00");
    await details(page, { name: "Back Button", email: `back-${tag()}@example.com` });
    await submit(page).click();
    await page.waitForURL(CODE);
    await page.goBack();
    await expect(page.getByTestId("booking-flow")).toBeVisible();
    await expect(page.getByTestId("booking-error")).toHaveCount(0);
    expect((await service.from("bookings").select("id").eq("resource_id", fx.resources[0].id)).data).toHaveLength(1);
  } finally {
    await context.close();
    await fx.cleanup();
  }
});
