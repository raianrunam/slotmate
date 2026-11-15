import { createHash, randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { serviceClient } from "../db/helpers";
import { addDaysToDate, todayInZone } from "../../src/lib/time/slots";
import { SCREENSHOT_DIR } from "./helpers";
import { LOGGED_OUT } from "./owner";
import { addResource, addWorkspace, cleanupOwners, logIn, newOwner, setPlan, sharedPerFile, tag, type TestOwner } from "./owners";

// Phase 17 (part D): the pages that matter most, filled with realistic data (a Pro owner, three resources,
// bookings in every status over several weeks), opened at 375, 768 and 1280 px. Each page is checked for
// horizontal scrolling and saved as a full-page screenshot in <screenshots>/final/ (for the README).
// A person (or Claude with the image viewer) looks at the pictures; the automated part only catches the
// layout failure that is easy to measure.

test.afterAll(cleanupOwners);

const service = serviceClient();
const WIDTHS = [
  { width: 375, height: 812 },
  { width: 768, height: 1024 },
  { width: 1280, height: 800 },
] as const;
const FINAL_DIR = path.join(SCREENSHOT_DIR, "final");

interface Demo {
  owner: TestOwner;
  slug: string;
}

const NAMES = ["Amira Khan", "Ben Walker", "Chloe Martin", "Dev Patel", "Elena Rossi", "Femi Ade", "Grace Liu", "Hugo Silva", "Ines Moreau", "Jon Park", "Kara Novak", "Leo Fischer"];

function demo(): Promise<Demo> {
  return sharedPerFile("demo", async () => {
    const owner = await newOwner();
    await setPlan(owner.id, "pro");
    const slug = `sunrise-${tag()}`;
    const workspaceId = await addWorkspace(owner, "Sunrise Studio", slug, "Europe/London");
    const resourceIds: string[] = [];
    for (const [name, slot, capacity] of [["Meeting room A", 60, 8], ["Quiet desk", 30, 1], ["Podcast booth", 60, 3]] as const) {
      const id = await addResource(owner, workspaceId, name);
      const update = await owner.client.from("resources").update({ slot_minutes: slot, capacity, description: `${name}, bookable by the slot.` }).eq("id", id).select("id");
      if (update.error) throw new Error(update.error.message);
      const hours = await owner.client.from("resource_availability").insert([1, 2, 3, 4, 5].map((weekday) => ({ resource_id: id, weekday, opens_at: "08:00", closes_at: "20:00" })));
      if (hours.error) throw new Error(hours.error.message);
      resourceIds.push(id);
    }
    let i = 0;
    for (const offset of [-20, -17, -14, -13, -10, -9, -8, -6, -5, -3, -2, 1, 2, 3, 4, 7, 8, 9]) {
      const date = addDaysToDate(todayInZone("UTC"), offset);
      if ([0, 6].includes(new Date(`${date}T00:00:00Z`).getUTCDay())) continue;
      const code = randomBytes(32).toString("base64url");
      const booked = await service.rpc("submit_booking", {
        p_resource_id: resourceIds[i % 3],
        p_starts_at: `${date}T${String(9 + (i % 6)).padStart(2, "0")}:00:00.000Z`,
        p_visitor_name: NAMES[i % NAMES.length],
        p_visitor_email: `visitor${i}@example.com`,
        p_visitor_phone: null as unknown as string,
        p_note: i % 3 === 0 ? "Please set up a whiteboard." : (null as unknown as string),
        p_attendees: 1,
        p_status_token_hash: `\\x${createHash("sha256").update(code).digest("hex")}`,
      });
      if (!booked.error && booked.data?.[0]) {
        const status = offset < 0 ? (i % 4 === 3 ? "rejected" : "approved") : i % 3 === 0 ? "approved" : "pending";
        if (status !== "pending") await owner.client.from("bookings").update({ status }).eq("id", booked.data[0].booking_id);
        // Spread the "received" day over the last weeks so the analytics charts have something to show.
        const received = new Date(Date.now() - (i * 1.6 + 0.2) * 86_400_000).toISOString();
        await service.from("bookings").update({ created_at: received }).eq("id", booked.data[0].booking_id);
      }
      i++;
    }
    return { owner, slug };
  });
}

interface PageSpec {
  name: string;
  path: (d: Demo) => string;
  login?: boolean;
  ready: (page: Page) => Promise<void>;
}
const main = (page: Page) => expect(page.getByRole("main").or(page.getByTestId("embed-root")).first()).toBeVisible();

const PAGES: PageSpec[] = [
  { name: "home", path: () => "/", login: false, ready: main },
  { name: "book", path: (d) => `/book/${d.slug}`, login: false, ready: main },
  { name: "embed", path: (d) => `/embed/${d.slug}`, login: false, ready: main },
  { name: "dashboard", path: () => "/dashboard", login: true, ready: main },
  { name: "dashboard-bookings", path: () => "/dashboard/bookings", login: true, ready: main },
  { name: "dashboard-analytics", path: () => "/dashboard/analytics", login: true, ready: main },
  { name: "dashboard-billing", path: () => "/dashboard/billing", login: true, ready: main },
];

test.describe("final screenshots with realistic data", () => {
  test.use({ storageState: LOGGED_OUT });
  test.describe.configure({ timeout: 120_000 });

  for (const spec of PAGES) {
    for (const { width, height } of WIDTHS) {
      test(`${spec.name} at ${width}px: no horizontal scrolling, screenshot saved`, async ({ page }) => {
        const d = await demo();
        await page.setViewportSize({ width, height });
        if (spec.login) await logIn(page, d.owner);
        await page.goto(spec.path(d));
        await spec.ready(page);
        await expect(page.locator("[aria-busy=true]"), "loading placeholders are gone").toHaveCount(0);
        if (spec.name === "dashboard-analytics") await page.waitForTimeout(1500); // the charts animate in
        const { overflow, culprits } = await page.evaluate(() => {
          const limit = window.innerWidth;
          const wide = [...document.querySelectorAll("body *")]
            .filter((el) => el.getBoundingClientRect().right > limit + 1)
            .slice(0, 5)
            .map((el) => `<${el.tagName.toLowerCase()} class="${String(el.className).slice(0, 80)}"> right edge ${Math.round(el.getBoundingClientRect().right)}`);
          return { overflow: document.documentElement.scrollWidth - limit, culprits: wide };
        });
        if (overflow > 0) {
          mkdirSync(FINAL_DIR, { recursive: true });
          await page.screenshot({ path: path.join(FINAL_DIR, `OVERFLOW-${spec.name}-${width}.png`), fullPage: true });
        }
        expect(overflow, `${spec.name} at ${width}px scrolls sideways by ${overflow}px; wide elements: ${culprits.join(" ; ")}`).toBeLessThanOrEqual(0);
        mkdirSync(FINAL_DIR, { recursive: true });
        await page.screenshot({ path: path.join(FINAL_DIR, `${spec.name}-${width}.png`), fullPage: true });
      });
    }
  }
});
