import { createHash, randomBytes } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { serviceClient } from "../db/helpers";
import { addDaysToDate, todayInZone } from "../../src/lib/time/slots";
import { LOGGED_OUT } from "./owner";
import { addResource, addWorkspace, cleanupOwners, logIn, newOwner, setPlan, tag } from "./owners";

// Phase 17 (part E, decision D21): how long until the MAIN CONTENT of the two busiest pages is on screen,
// measured against the production build (this suite always runs `npm run build` + `npm run start`), in a
// real browser, with real data (a Pro owner, 3 resources, 15 bookings). "Main content" means the real
// content, not the loading placeholder: the heading and the first data item are visible and no
// loading placeholder (aria-busy) is left. Each page is opened 5 times (cold first, then warm); the
// MEDIAN and the worst time are printed, and the median must stay under the 3 s budget of D21.
// Numbers depend on the machine and on the distance to the Supabase project; they are indicative.

test.use({ storageState: LOGGED_OUT });
test.afterAll(cleanupOwners);
test.describe.configure({ mode: "serial", timeout: 180_000 });

const BUDGET_MS = 3000;
const RUNS = 5;
const service = serviceClient();

async function timeIt(page: Page, url: string, firstItem: () => ReturnType<Page["locator"]>) {
  const started = Date.now();
  await page.goto(url, { waitUntil: "commit" });
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(firstItem()).toBeVisible();
  await expect(page.locator("[aria-busy=true]")).toHaveCount(0);
  const wall = Date.now() - started;
  const lcp = await page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        let value = 0;
        new PerformanceObserver((list) => {
          for (const e of list.getEntries()) value = e.startTime;
        }).observe({ type: "largest-contentful-paint", buffered: true });
        setTimeout(() => resolve(Math.round(value)), 300);
      }),
  );
  return { wall, lcp };
}

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

test("main content time of the public booking page and the dashboard stays under 3 s", async ({ page }) => {
  const owner = await newOwner();
  await setPlan(owner.id, "pro");
  const slug = `perf-${tag()}`;
  const workspaceId = await addWorkspace(owner, "Perf Studio", slug, "Europe/London");
  const ids: string[] = [];
  for (const name of ["Room A", "Room B", "Room C"]) {
    const id = await addResource(owner, workspaceId, name);
    await owner.client.from("resource_availability").insert([1, 2, 3, 4, 5].map((weekday) => ({ resource_id: id, weekday, opens_at: "08:00", closes_at: "20:00" })));
    ids.push(id);
  }
  for (let i = 0; i < 15; i++) {
    const code = randomBytes(32).toString("base64url");
    await service.rpc("submit_booking", {
      p_resource_id: ids[i % 3],
      p_starts_at: `${addDaysToDate(todayInZone("UTC"), 20 + i)}T1${i % 8}:00:00.000Z`,
      p_visitor_name: `Visitor ${i}`,
      p_visitor_email: `v${i}@example.com`,
      p_visitor_phone: null as unknown as string,
      p_note: null as unknown as string,
      p_attendees: 1,
      p_status_token_hash: `\\x${createHash("sha256").update(code).digest("hex")}`,
    });
  }

  const report: string[] = [];
  const check = async (name: string, url: string, firstItem: () => ReturnType<Page["locator"]>) => {
    const walls: number[] = [];
    const lcps: number[] = [];
    for (let i = 0; i < RUNS; i++) {
      const r = await timeIt(page, url, firstItem);
      walls.push(r.wall);
      lcps.push(r.lcp);
    }
    const line = `${name}: main content median ${median(walls)} ms, worst ${Math.max(...walls)} ms, first ${walls[0]} ms; largest paint median ${median(lcps)} ms`;
    report.push(line);
    console.log(`[performance] ${line}`);
    expect(median(walls), line).toBeLessThan(BUDGET_MS);
  };

  await check("public booking page", `/book/${slug}`, () => page.getByText("Room A", { exact: true }).first());
  await logIn(page, owner);
  await check("dashboard overview", "/dashboard", () => page.getByTestId("overview-total-bookings"));
  await check("dashboard bookings list", "/dashboard/bookings", () => page.getByTestId("booking-row").first());
  test.info().annotations.push({ type: "performance", description: report.join(" | ") });
});
