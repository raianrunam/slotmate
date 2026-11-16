import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  analyticsAccess,
  buildAnalytics,
  dailySeries,
  dayStartInstant,
  defaultRange,
  monthlySeries,
  overviewDailySeries,
  overviewRange,
  parseRange,
  parseWorkspaceParam,
  pickWorkspace,
  collectPages,
  rangeBounds,
  resourceUsage,
  statusTotals,
  type AnalyticsAccess,
} from "../../src/features/analytics/aggregate";
import { addDaysToDate } from "../../src/lib/time/slots";

// Phase 13: analytics maths (pure), the Pro gate, and source guards (ANLT-01 to ANLT-06, A12, DB7, Q12).

const read = (rel: string) => readFileSync(path.join(process.cwd(), rel), "utf8");
const NOW = new Date("2026-11-15T10:00:00Z");

test.describe("status totals (ANLT-01, ANLT-05)", () => {
  test("counts each status and the total; unknown statuses are ignored", () => {
    const t = statusTotals([{ status: "pending" }, { status: "pending" }, { status: "approved" }, { status: "rejected" }, { status: "cancelled" }, { status: "weird" }]);
    expect(t).toEqual({ pending: 2, approved: 1, rejected: 1, cancelled: 1, total: 5 });
  });
  test("no bookings gives zeros", () => {
    expect(statusTotals([])).toEqual({ pending: 0, approved: 0, rejected: 0, cancelled: 0, total: 0 });
  });
});

test.describe("daily series: days in the workspace's zone (A12), zero filled (ANLT-02)", () => {
  test("every day of the range is present, empty days are 0", () => {
    const s = dailySeries(["2026-11-10T12:00:00Z", "2026-11-10T13:00:00Z", "2026-11-12T01:00:00Z"], "UTC", { from: "2026-11-09", to: "2026-11-13" });
    expect(s.map((p) => [p.date, p.count])).toEqual([
      ["2026-11-09", 0],
      ["2026-11-10", 2],
      ["2026-11-11", 0],
      ["2026-11-12", 1],
      ["2026-11-13", 0],
    ]);
    expect(s[0].label).toBe("9 Nov");
  });
  test("the default range is 30 days ending today in the zone", () => {
    const r = defaultRange("UTC", NOW);
    expect(r).toEqual({ from: "2026-10-17", to: "2026-11-15" });
    expect(dailySeries([], "UTC", r)).toHaveLength(30);
    // Dhaka is already on the 16th at 10:00 UTC + 14h; at 10:00 UTC it is 16:00 on the 15th.
    expect(defaultRange("Asia/Dhaka", new Date("2026-11-15T19:00:00Z")).to).toBe("2026-11-16");
  });
  test("Asia/Dhaka (UTC+6): 18:00 to 23:59 UTC belongs to the NEXT local day", () => {
    const s = dailySeries(
      ["2026-11-14T17:59:59Z", "2026-11-14T18:00:00Z", "2026-11-14T23:59:59Z", "2026-11-15T00:00:00Z", "2026-11-15T17:59:59Z", "2026-11-15T18:00:00Z"],
      "Asia/Dhaka",
      { from: "2026-11-14", to: "2026-11-16" },
    );
    expect(s.map((p) => [p.date, p.count])).toEqual([
      ["2026-11-14", 1],
      ["2026-11-15", 4],
      ["2026-11-16", 1],
    ]);
  });
  test("America/New_York spring forward (2026-03-08): the 23-hour day is one day", () => {
    const s = dailySeries(
      ["2026-03-08T04:59:59Z", "2026-03-08T05:00:00Z", "2026-03-08T06:59:59Z", "2026-03-08T07:00:00Z", "2026-03-09T03:59:59Z", "2026-03-09T04:00:00Z"],
      "America/New_York",
      { from: "2026-03-07", to: "2026-03-09" },
    );
    expect(s.map((p) => [p.date, p.count])).toEqual([
      ["2026-03-07", 1],
      ["2026-03-08", 4],
      ["2026-03-09", 1],
    ]);
  });
  test("America/New_York fall back (2026-11-01): the 25-hour day is one day", () => {
    const s = dailySeries(["2026-11-01T03:59:59Z", "2026-11-01T04:00:00Z", "2026-11-02T04:59:59Z", "2026-11-02T05:00:00Z"], "America/New_York", { from: "2026-10-31", to: "2026-11-02" });
    expect(s.map((p) => [p.date, p.count])).toEqual([
      ["2026-10-31", 1],
      ["2026-11-01", 2],
      ["2026-11-02", 1],
    ]);
  });
  test("Europe/London clock changes (2026-03-29 and 2026-10-25)", () => {
    const spring = dailySeries(["2026-03-29T00:00:00Z", "2026-03-29T22:59:59Z", "2026-03-29T23:00:00Z"], "Europe/London", { from: "2026-03-29", to: "2026-03-30" });
    expect(spring.map((p) => p.count)).toEqual([2, 1]);
    const autumn = dailySeries(["2026-10-24T22:59:59Z", "2026-10-24T23:00:00Z", "2026-10-25T23:59:59Z", "2026-10-26T00:00:00Z"], "Europe/London", { from: "2026-10-24", to: "2026-10-26" });
    expect(autumn.map((p) => p.count)).toEqual([1, 2, 1]);
  });
});

test.describe("range bounds as instants", () => {
  test("a day starts at local midnight, across clock changes", () => {
    expect(dayStartInstant("2026-03-08", "America/New_York").toISOString()).toBe("2026-03-08T05:00:00.000Z");
    expect(dayStartInstant("2026-03-09", "America/New_York").toISOString()).toBe("2026-03-09T04:00:00.000Z");
    expect(dayStartInstant("2026-11-01", "America/New_York").toISOString()).toBe("2026-11-01T04:00:00.000Z");
    expect(dayStartInstant("2026-11-02", "America/New_York").toISOString()).toBe("2026-11-02T05:00:00.000Z");
    expect(dayStartInstant("2026-03-30", "Europe/London").toISOString()).toBe("2026-03-29T23:00:00.000Z");
    expect(dayStartInstant("2026-11-15", "Asia/Dhaka").toISOString()).toBe("2026-11-14T18:00:00.000Z");
  });
  test("the bounds are [start of from, start of the day after to)", () => {
    const b = rangeBounds({ from: "2026-11-14", to: "2026-11-15" }, "Asia/Dhaka");
    expect(b.from.toISOString()).toBe("2026-11-13T18:00:00.000Z");
    expect(b.until.toISOString()).toBe("2026-11-15T18:00:00.000Z");
  });
});

test.describe("range bounds are exact: no gap and no overlap between neighbouring ranges (Phase 13 review)", () => {
  test("the end of one day is the start of the next, in every zone, including the 23-hour and 25-hour days", () => {
    for (const zone of ["UTC", "Asia/Dhaka", "America/New_York", "Europe/London", "Australia/Lord_Howe", "Asia/Kolkata"]) {
      for (const day of ["2026-03-07", "2026-03-08", "2026-03-28", "2026-03-29", "2026-10-24", "2026-10-25", "2026-11-01", "2026-11-14"]) {
        const next = addDaysToDate(day, 1);
        const a = rangeBounds({ from: day, to: day }, zone);
        const b = rangeBounds({ from: next, to: next }, zone);
        expect(a.until.getTime(), `${zone} ${day}: the day ends exactly where the next one starts`).toBe(b.from.getTime());
        expect(a.until.getTime() - a.from.getTime(), `${zone} ${day}: a day is 23, 24 or 25 hours (or 23.5 / 24.5 at Lord Howe)`).toBeGreaterThanOrEqual(23 * 3_600_000);
        expect(a.until.getTime() - a.from.getTime()).toBeLessThanOrEqual(25 * 3_600_000);
      }
    }
    // A booking made exactly at the end instant belongs to the NEXT day (the upper bound is exclusive).
    const b = rangeBounds({ from: "2026-11-14", to: "2026-11-14" }, "Asia/Dhaka");
    expect(dailySeries([b.until.toISOString()], "Asia/Dhaka", { from: "2026-11-14", to: "2026-11-15" }).map((d) => d.count)).toEqual([0, 1]);
    expect(dailySeries([b.from.toISOString()], "Asia/Dhaka", { from: "2026-11-14", to: "2026-11-15" }).map((d) => d.count)).toEqual([1, 0]);
  });
});

test.describe("paging (Phase 13 review: a lower host page size must not undercount silently)", () => {
  const data = Array.from({ length: 2500 }, (_, i) => i);
  const server = (limit: number) => {
    const calls: number[] = [];
    return { calls, fetch: async (offset: number) => (calls.push(offset), data.slice(offset, offset + limit)) };
  };
  test("collects everything whatever the page size the host really uses (1000, 500, 7)", async () => {
    for (const limit of [1000, 500, 7]) {
      const s = server(limit);
      const result = await collectPages(s.fetch, 2500, 20_000);
      expect(result.rows, `limit ${limit}`).toHaveLength(2500);
      expect(result.rows[0]).toBe(0);
      expect(result.rows[2499]).toBe(2499);
      expect(new Set(result.rows).size, "no row twice").toBe(2500);
      expect(result.truncated).toBe(false);
      expect(s.calls[0]).toBe(0);
      expect(s.calls[1]).toBe(limit); // the next page starts after the rows received
    }
  });
  test("stops at the cap and says so; an exact total at the cap is not truncated", async () => {
    const capped = await collectPages(server(1000).fetch, 2500, 2000);
    expect(capped.rows).toHaveLength(2000);
    expect(capped.truncated).toBe(true);
    const exact = await collectPages(server(1000).fetch, 2000, 2000);
    expect(exact.rows).toHaveLength(2000);
    expect(exact.truncated).toBe(false);
  });
  test("an empty page before the total is reached is reported as truncated, never as complete; no rows means no calls", async () => {
    const short = await collectPages(async (offset) => data.slice(offset, offset + 100).filter((n) => n < 250), 400, 20_000);
    expect(short.rows).toHaveLength(250);
    expect(short.truncated).toBe(true);
    const s = server(1000);
    expect(await collectPages(s.fetch, 0, 20_000)).toEqual({ rows: [], truncated: false });
    expect(s.calls).toEqual([]);
  });
});

test.describe("monthly series (ANLT-03)", () => {
  test("one point per month of the range, zero filled, months taken in the zone", () => {
    const s = monthlySeries(["2026-08-31T20:00:00Z", "2026-09-05T10:00:00Z", "2026-09-06T10:00:00Z", "2026-11-14T18:30:00Z"], "Asia/Dhaka", { from: "2026-08-15", to: "2026-11-20" });
    // 2026-08-31 20:00 UTC is already 1 September in Dhaka; 2026-11-14 18:30 UTC is 15 November.
    expect(s.map((p) => [p.month, p.count])).toEqual([
      ["2026-08", 0],
      ["2026-09", 3],
      ["2026-10", 0],
      ["2026-11", 1],
    ]);
    expect(s[1].label).toBe("Sep 2026");
  });
  test("crosses a year end", () => {
    const s = monthlySeries([], "UTC", { from: "2026-11-01", to: "2027-02-10" });
    expect(s.map((p) => p.month)).toEqual(["2026-11", "2026-12", "2027-01", "2027-02"]);
  });
});

test.describe("resource usage (ANLT-04)", () => {
  test("most used first, ties by name, unused resources listed with 0", () => {
    const r = resourceUsage([{ resourceId: "b" }, { resourceId: "b" }, { resourceId: "a" }, { resourceId: "c" }, {}], [
      { id: "a", name: "Alpha" },
      { id: "b", name: "Beta" },
      { id: "c", name: "Aardvark" },
      { id: "d", name: "Delta" },
    ]);
    expect(r.map((p) => [p.name, p.count])).toEqual([
      ["Beta", 2],
      ["Aardvark", 1],
      ["Alpha", 1],
      ["Delta", 0],
    ]);
  });
});

test.describe("date range validation (ANLT-06)", () => {
  const p = (from: string | undefined, to: string | undefined) => parseRange(from, to, "UTC", NOW);
  test("nothing given: the last 30 days, not custom", () => {
    expect(p(undefined, undefined)).toEqual({ range: { from: "2026-10-17", to: "2026-11-15" }, error: null, custom: false });
    expect(p("", "  ").custom).toBe(false);
  });
  test("a valid range is accepted", () => {
    expect(p("2026-01-01", "2026-03-31")).toEqual({ range: { from: "2026-01-01", to: "2026-03-31" }, error: null, custom: true });
  });
  test("only one end given: the other is chosen; a future end is moved back to today", () => {
    expect(p("2026-11-01", undefined).range).toEqual({ from: "2026-11-01", to: "2026-11-15" });
    expect(p(undefined, "2026-11-10").range).toEqual({ from: "2026-10-12", to: "2026-11-10" });
    expect(p("2026-11-01", "2027-05-01").range.to).toBe("2026-11-15");
  });
  test("an end before the start is refused and the default is used", () => {
    const r = p("2026-11-10", "2026-11-01");
    expect(r.error).toMatch(/end date cannot be before/i);
    expect(r.range).toEqual(defaultRange("UTC", NOW));
    expect(r.custom).toBe(false);
  });
  test("not a date, an impossible date, a very old date and a huge span are refused", () => {
    expect(p("abc", "2026-11-01").error).toBeTruthy();
    expect(p("2026-02-30", "2026-03-01").error).toBeTruthy();
    expect(p("2026-1-1", "2026-11-01").error).toBeTruthy();
    expect(p("1999-01-01", "2026-11-01").error).toMatch(/before/);
    expect(p("2025-01-01", "2026-11-01").error).toMatch(/at most 366/);
    expect(p("2025-11-15", "2026-11-15").error).toBeNull(); // exactly 366 days (a leap-free year plus one day) is allowed
  });
});

test.describe("Pro gate (ANLT-03, 04, 06; DB7, Q12)", () => {
  test("only an active or trialing Pro subscription gets the Pro views", () => {
    expect(analyticsAccess({ plan: "pro", status: "active" })).toEqual({ plan: "pro", monthly: true, resources: true, rangeFilter: true });
    expect(analyticsAccess({ plan: "pro", status: "trialing" }).monthly).toBe(true);
    for (const sub of [{ plan: "pro", status: "canceled" }, { plan: "pro", status: "past_due" }, { plan: "pro", status: null }, { plan: "free", status: "active" }, null, undefined]) {
      expect(analyticsAccess(sub), JSON.stringify(sub)).toEqual({ plan: "free", monthly: false, resources: false, rangeFilter: false });
    }
  });
  test("a Free result has NO Pro dataset (the keys do not exist), a Pro result has them", () => {
    const facts = [{ status: "pending", createdAt: "2026-11-14T10:00:00Z", resourceId: "r1" }];
    const resources = [{ id: "r1", name: "Room" }];
    const range = { from: "2026-11-01", to: "2026-11-15" };
    const free = buildAnalytics({ facts, resources, timeZone: "UTC", range, access: analyticsAccess({ plan: "free", status: null }) });
    expect(Object.keys(free).sort()).toEqual(["daily", "range", "totals"]);
    expect(JSON.stringify(free)).not.toContain("Room");
    const pro = buildAnalytics({ facts, resources, timeZone: "UTC", range, access: analyticsAccess({ plan: "pro", status: "active" }) });
    expect(pro.monthly).toHaveLength(1);
    expect(pro.resources).toEqual([{ resourceId: "r1", name: "Room", count: 1 }]);
  });
  test("each Pro dataset follows its own flag", () => {
    const only = (access: Partial<AnalyticsAccess>) =>
      buildAnalytics({ facts: [], resources: [], timeZone: "UTC", range: { from: "2026-11-01", to: "2026-11-02" }, access: { plan: "free", monthly: false, resources: false, rangeFilter: false, ...access } });
    expect(only({ monthly: true }).resources).toBeUndefined();
    expect(only({ resources: true }).monthly).toBeUndefined();
  });
});

test.describe("address parameters", () => {
  const id = "123e4567-e89b-42d3-a456-426614174000";
  test("a workspace id must look like a UUID; junk is ignored", () => {
    expect(parseWorkspaceParam(id.toUpperCase())).toBe(id);
    expect(parseWorkspaceParam([id, "x"])).toBe(id);
    expect(parseWorkspaceParam("1 or 1=1")).toBeUndefined();
    expect(parseWorkspaceParam(undefined)).toBeUndefined();
  });
  test("only an own workspace can be picked; others fall back to the first", () => {
    const own = [{ id: "a" }, { id: "b" }];
    expect(pickWorkspace(own, "b")).toEqual({ id: "b" });
    expect(pickWorkspace(own, "zzz")).toEqual({ id: "a" });
    expect(pickWorkspace(own, undefined)).toEqual({ id: "a" });
    expect(pickWorkspace([], "a")).toBeUndefined();
  });
});

test.describe("source guards", () => {
  const queries = read("src/features/analytics/queries.ts");
  const page = read("src/app/dashboard/analytics/page.tsx");
  const chart = read("src/features/analytics/components/bar-chart.tsx");

  test("the analytics feature never uses the admin (secret-key) client", () => {
    for (const f of ["src/features/analytics/queries.ts", "src/features/analytics/aggregate.ts", "src/app/dashboard/analytics/page.tsx", "src/features/analytics/components/analytics-view.tsx", "src/features/analytics/components/analytics-filters.tsx"]) {
      expect(read(f), f).not.toMatch(/supabase\/admin|SECRET_KEY|SERVICE_ROLE/i);
    }
    expect(queries).toMatch(/^import "server-only"/m);
    expect(queries).toMatch(/from "@\/lib\/supabase\/server"/);
  });
  test("the page checks the owner first", () => {
    expect(page).toMatch(/<OwnerGate>/);
  });
  test("the plan is decided by analyticsAccess (effectivePlan), and Pro data is built only behind the gate", () => {
    expect(queries).toMatch(/analyticsAccess\(/);
    expect(read("src/features/analytics/aggregate.ts")).toMatch(/effectivePlan\(subscription\)/);
    expect(read("src/features/analytics/aggregate.ts")).toMatch(/if \(access\.monthly\) data\.monthly/);
    expect(read("src/features/analytics/aggregate.ts")).toMatch(/if \(access\.resources\) data\.resources/);
    // resource ids and resource names are read only when the gate allows
    expect(queries).toMatch(/access\.resources \? "[^"]*resource_id/);
    expect(queries).toMatch(/if \(access\.resources\) \{/);
    // a Free owner's from/to in the address is ignored
    expect(page).toMatch(/access\.rangeFilter\s*\?\s*parseRange/);
  });
  test("the chart component is a client component that imports no server module and gets only plain data", () => {
    expect(chart).toMatch(/^"use client"/);
    expect(chart).not.toMatch(/@\/lib|@\/features|supabase|server-only/);
  });
});

test.describe("dashboard overview trend across workspaces (DASH-05)", () => {
  test("the 30 days end on the LATEST local today among the zones", () => {
    // 2026-11-15 10:00 UTC: Kiritimati (UTC+14) is already 16 Nov, Pago Pago (UTC-11) is still 14 Nov.
    const r = overviewRange(["Pacific/Pago_Pago", "UTC", "Pacific/Kiritimati"], NOW);
    expect(r.to).toBe("2026-11-16");
    expect(r.from).toBe("2026-10-18");
  });

  test("no workspace uses UTC", () => {
    expect(overviewRange([], NOW)).toEqual({ from: "2026-10-17", to: "2026-11-15" });
  });

  test("each booking is counted on its own workspace's local date, zero filled, 30 entries", () => {
    const range = { from: "2026-10-17", to: "2026-11-15" };
    // 2026-11-14 23:30 UTC is 15 Nov in Dhaka (UTC+6) but 14 Nov in UTC.
    const s = overviewDailySeries(
      [
        { createdAt: "2026-11-14T23:30:00Z", timeZone: "Asia/Dhaka" },
        { createdAt: "2026-11-14T23:30:00Z", timeZone: "UTC" },
        { createdAt: "2026-11-14T10:00:00Z", timeZone: "UTC" },
      ],
      range,
    );
    expect(s).toHaveLength(30);
    expect(s.find((p) => p.date === "2026-11-15")?.count).toBe(1);
    expect(s.find((p) => p.date === "2026-11-14")?.count).toBe(2);
    expect(s.filter((p) => p.count === 0)).toHaveLength(28);
  });

  test("a booking whose local day is outside the window is not counted", () => {
    const s = overviewDailySeries([{ createdAt: "2026-01-01T00:00:00Z", timeZone: "UTC" }], { from: "2026-10-17", to: "2026-11-15" });
    expect(s.reduce((n, p) => n + p.count, 0)).toBe(0);
  });

  test("the overview reads with the owner's session only (no admin client)", () => {
    const q = read("src/features/analytics/queries.ts");
    expect(q).not.toContain("admin");
    expect(read("src/app/dashboard/page.tsx")).toContain("getOverviewTrend");
  });
});
