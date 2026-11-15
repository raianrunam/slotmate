import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { explainNoChange, FRIENDLY, mapBookingError } from "../../src/features/bookings/db-errors";
import { historyText, momentLabel, whenLabel } from "../../src/features/bookings/format";
import {
  bookingIdSchema,
  containsPattern,
  escapeLike,
  listHref,
  parseListParams,
  postgrestQuote,
  SEARCH_MAX,
  TRANSITIONS,
} from "../../src/features/bookings/schema";

test.describe("list parameters (BOOK-01, BOOK-07, BOOK-08)", () => {
  test("defaults, unknown values and junk never throw", () => {
    expect(parseListParams({})).toEqual({ status: "all", q: "", page: 1 });
    expect(parseListParams({ status: "bogus", q: undefined, page: "abc" })).toEqual({ status: "all", q: "", page: 1 });
    expect(parseListParams({ status: ["pending", "approved"], page: ["3", "4"] })).toEqual({ status: "pending", q: "", page: 3 });
    expect(parseListParams({ page: "0" }).page).toBe(1);
    expect(parseListParams({ page: "-4" }).page).toBe(1);
    expect(parseListParams({ page: "2.9" }).page).toBe(2);
    expect(parseListParams({ page: "99999999999999999999" }).page).toBeLessThanOrEqual(1_000_000);
  });

  test("every status is accepted; the search is trimmed, squeezed and cut to the maximum", () => {
    for (const status of ["all", "pending", "approved", "rejected", "cancelled"] as const) {
      expect(parseListParams({ status }).status).toBe(status);
    }
    expect(parseListParams({ q: "   Ada   Lovelace  " }).q).toBe("Ada Lovelace");
    const long = parseListParams({ q: "x".repeat(SEARCH_MAX + 50) }).q;
    expect(long).toHaveLength(SEARCH_MAX);
  });

  test("addresses keep status, search and page; page 1 and 'all' are left out; the text is encoded", () => {
    expect(listHref({})).toBe("/dashboard/bookings");
    expect(listHref({ status: "all", q: "", page: 1 })).toBe("/dashboard/bookings");
    expect(listHref({ status: "pending", q: "a&b=c", page: 3 })).toBe("/dashboard/bookings?status=pending&q=a%26b%3Dc&page=3");
  });
});

test.describe("search escaping (DB13)", () => {
  test("% _ and the backslash are letters, not wildcards", () => {
    expect(escapeLike("100%")).toBe("100\\%");
    expect(escapeLike("a_b")).toBe("a\\_b");
    expect(escapeLike("a\\b")).toBe("a\\\\b");
    expect(escapeLike("plain")).toBe("plain");
    expect(containsPattern("5%_")).toBe("%5\\%\\_%");
  });

  test("a filter value is quoted, so commas, dots and brackets stay text; quote and backslash are escaped for the quoting", () => {
    expect(postgrestQuote("a,b).c")).toBe('"a,b).c"');
    expect(postgrestQuote('say "hi"')).toBe('"say \\"hi\\""');
    // The pattern for a search of one backslash: ILIKE escape first (\\), then the quoting (\\\\).
    expect(postgrestQuote(containsPattern("\\"))).toBe('"%\\\\\\\\%"');
  });
});

test.describe("booking ids and the allowed actions", () => {
  test("an id must be a UUID", () => {
    expect(bookingIdSchema.safeParse("11111111-1111-4111-8111-111111111111").success).toBe(true);
    for (const bad of ["", "abc", "1", "../x", "11111111-1111-4111-8111-11111111111", "null"]) {
      expect(bookingIdSchema.safeParse(bad).success, bad).toBe(false);
    }
  });

  test("the three actions match the database trigger exactly (D10, BOOK-03 to BOOK-05)", () => {
    expect(TRANSITIONS).toEqual({
      approve: { from: "pending", to: "approved" },
      reject: { from: "pending", to: "rejected" },
      cancel: { from: "approved", to: "cancelled" },
    });
  });
});

test.describe("database error mapping", () => {
  test("invalid_status_change becomes the 'already changed' sentence; raw text never appears", () => {
    expect(mapBookingError({ message: "invalid_status_change" })).toBe("changed");
    expect(mapBookingError({ message: " invalid_status_change " })).toBe("changed");
    expect(mapBookingError({ message: "some invalid_status_change text with secrets" })).toBe("generic"); // exact names only
    expect(mapBookingError({ code: "42501", message: "permission denied for table bookings" })).toBe("locked");
    expect(mapBookingError({ code: "40P01", message: "deadlock detected" })).toBe("generic");
    expect(mapBookingError({})).toBe("generic");
    for (const sentence of Object.values(FRIENDLY)) expect(sentence).not.toMatch(/postgres|sql|constraint|violat/i);
    expect(FRIENDLY.changed).toBe("This booking was already changed. Reload the page to see its status.");
  });

  test("a write that changed nothing is explained from what the owner can see", () => {
    expect(explainNoChange(null, "pending")).toBe("notFound");
    expect(explainNoChange({ status: "pending", locked: true }, "pending")).toBe("locked");
    expect(explainNoChange({ status: "approved", locked: false }, "pending")).toBe("changed");
    expect(explainNoChange({ status: "pending", locked: false }, "pending")).toBe("generic");
    expect(explainNoChange({ status: "approved", locked: false }, null)).toBe("generic"); // a delete has no expected status
  });
});

test.describe("words for times (WORK-04)", () => {
  test("the time is in the workspace's zone, and the zone is named", () => {
    // 23:30 UTC on 16 November is 23:30 in London (winter) and 18:30 in New York.
    const london = whenLabel("2026-11-16T23:30:00Z", "2026-11-17T00:30:00Z", "Europe/London");
    expect(london).toEqual({ date: "Monday 16 November 2026", range: "23:30 to 00:30", zone: "London time (Europe/London)" });
    const ny = whenLabel("2026-11-16T23:30:00Z", "2026-11-17T00:30:00Z", "America/New_York");
    expect(ny.range).toBe("18:30 to 19:30");
    expect(ny.zone).toBe("New York time (America/New_York)");
    // The next day in Auckland (UTC+13 in November).
    expect(whenLabel("2026-11-16T23:30:00Z", "2026-11-17T00:30:00Z", "Pacific/Auckland").date).toBe("Tuesday 17 November 2026");
    expect(whenLabel("2026-11-16T10:00:00Z", "2026-11-16T11:00:00Z", "UTC").zone).toBe("UTC");
  });

  test("moments and history lines", () => {
    expect(momentLabel("2026-11-17T14:05:00Z")).toBe("17 Nov 2026, 14:05 UTC");
    expect(historyText("pending", "2026-11-17T14:05:00Z", "2026-11-17T14:05:00Z")).toEqual(["Request received on 17 Nov 2026, 14:05 UTC.", "Waiting for your decision."]);
    expect(historyText("approved", "2026-11-17T14:05:00Z", "2026-11-18T09:00:00Z")[1]).toBe("Approved on 18 Nov 2026, 09:00 UTC.");
    expect(historyText("rejected", "2026-11-17T14:05:00Z", "2026-11-18T09:00:00Z")[1]).toContain("The time is free again.");
    expect(historyText("cancelled", "2026-11-17T14:05:00Z", "2026-11-18T09:00:00Z")[1]).toContain("it had been approved");
  });
});

test.describe("source guards for the bookings feature", () => {
  const dir = path.join(process.cwd(), "src/features/bookings");
  const read = (f: string) => readFileSync(path.join(dir, f), "utf8");
  const actions = read("actions.ts");

  test("actions file is a server-only 'use server' file", () => {
    expect(actions.trimStart().startsWith('"use server"')).toBe(true);
    expect(actions).toMatch(/import "server-only"/);
  });

  test("every action checks the owner first; the status actions all go through one guarded function", () => {
    const bodies = [...actions.matchAll(/(?:export )?async function (\w+)\([^)]*\)[^{]*\{([\s\S]*?)\n\}\n/g)];
    const owned = bodies.filter(([, name]) => name === "changeStatus" || name === "deleteBooking");
    expect(owned.map((m) => m[1]).sort()).toEqual(["changeStatus", "deleteBooking"]);
    for (const [, name, body] of owned) expect(body.trimStart(), `${name} starts with the owner check`).toMatch(/^await requireOwner\(\);/);
    const exported = [...actions.matchAll(/export async function (\w+)/g)].map((m) => m[1]).sort();
    expect(exported).toEqual(["approveBooking", "cancelBooking", "deleteBooking", "rejectBooking"]);
    // The status update only matches the status the action starts from (two tabs cannot both win).
    expect(actions).toMatch(/\.update\(\{ status: to \}\)\.eq\("id", id\.data\)\.eq\("status", from\)/);
  });

  test("the owner's own session only: no secret key, no admin client, no raw database text, no insert", () => {
    for (const f of ["actions.ts", "queries.ts", "db-errors.ts", "schema.ts", "format.ts"]) {
      expect(read(f), f).not.toMatch(/SUPABASE_SECRET_KEY|service_role|createAdminClient|supabase\/admin/i);
    }
    expect(actions).not.toMatch(/\.error\.message/);
    expect(actions).not.toMatch(/\.from\("bookings"\)\.insert|\.rpc\(/);
  });

  test("cancel and delete ask first; approve and reject are plain forms", () => {
    const button = read("components/booking-actions.tsx");
    expect(button.match(/<ConfirmDialog/g)).toHaveLength(2);
    expect(button.match(/onConfirm=\{\(\) => (cancelForm|deleteForm)\.current\?\.requestSubmit\(\)\}/g)).toHaveLength(2);
  });

  test("the filter buttons are toggle buttons and the forms are plain GET forms (no JavaScript needed)", () => {
    const filters = read("components/booking-filters.tsx");
    expect(filters).toMatch(/aria-pressed=\{value === status\}/);
    expect(filters.match(/method="get"/g)).toHaveLength(2);
    expect(filters).not.toMatch(/"use client"/);
  });

  test("the search goes through the escape and the quoting helpers", () => {
    const queries = read("queries.ts");
    expect(queries).toMatch(/containsPattern\(params\.q\)/);
    expect(queries).toMatch(/postgrestQuote\(containsPattern\(params\.q\)\)/);
    expect(queries).not.toMatch(/ilike\([^)]*params\.q[^)]*\)\s*$/m);
  });
});
