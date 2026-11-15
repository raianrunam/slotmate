import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { ALL_FIELD_NAMES, clockText, fieldNames, MESSAGES, parseDays, toWindows } from "../../src/features/availability/schema";

// The weekly opening-hours form (AVAIL-01, AVAIL-02, DB9).

function form(days: Record<number, { open?: boolean; opens?: string; closes?: string }>): Record<string, string> {
  const out: Record<string, string> = {};
  for (let n = 1; n <= 7; n++) {
    const d = days[n] ?? {};
    const names = fieldNames(n);
    if (d.open) out[names.open] = "on";
    out[names.opens] = d.opens ?? "09:00";
    out[names.closes] = d.closes ?? "17:00";
  }
  return out;
}

test.describe("parseDays", () => {
  test("open days become rows, closed days are listed, closed days ignore their times", () => {
    const r = parseDays(form({ 1: { open: true, opens: "9:00", closes: "17:30" }, 2: { open: false, opens: "nonsense", closes: "also nonsense" }, 7: { open: true, opens: "00:00", closes: "24:00" } }));
    expect(r).toEqual({
      ok: true,
      open: [
        { weekday: 1, opens_at: "09:00", closes_at: "17:30" },
        { weekday: 7, opens_at: "00:00", closes_at: "24:00" },
      ],
      closedDays: [2, 3, 4, 5, 6],
    });
  });
  test("24:00 is allowed as a closing time only", () => {
    expect(parseDays(form({ 1: { open: true, opens: "00:00", closes: "24:00" } })).ok).toBe(true);
    const r = parseDays(form({ 1: { open: true, opens: "24:00", closes: "24:00" } }));
    expect(r).toMatchObject({ ok: false, errors: { "opens-1": MESSAGES.opensBad } });
  });
  test("closing must be later than opening (equal and earlier are refused)", () => {
    for (const [opens, closes] of [["12:00", "12:00"], ["17:00", "09:00"], ["09:01", "09:00"], ["23:59", "00:00"]]) {
      expect(parseDays(form({ 3: { open: true, opens, closes } })), `${opens}-${closes}`).toMatchObject({ ok: false, errors: { "closes-3": MESSAGES.order } });
    }
    expect(parseDays(form({ 3: { open: true, opens: "09:00", closes: "09:01" } })).ok).toBe(true);
  });
  test("unreadable times are refused with the right field named", () => {
    for (const bad of ["", "9", "09:60", "25:00", "ab:cd", "09:30:15", "-1:00", "9:5", "09.30"]) {
      const r = parseDays(form({ 4: { open: true, opens: bad, closes: "17:00" } }));
      expect(r, `opens "${bad}"`).toMatchObject({ ok: false, errors: { "opens-4": MESSAGES.opensBad } });
    }
    for (const bad of ["", "9", "09:60", "24:01", "25:00", "x"]) {
      const r = parseDays(form({ 4: { open: true, opens: "09:00", closes: bad } }));
      expect(r, `closes "${bad}"`).toMatchObject({ ok: false, errors: { "closes-4": MESSAGES.closesBad } });
    }
  });
  test("errors are reported for every bad day at once", () => {
    const r = parseDays(form({ 1: { open: true, opens: "x", closes: "17:00" }, 2: { open: true, opens: "10:00", closes: "09:00" } }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(["closes-2", "opens-1"]);
  });
  test("all closed is allowed (no open rows)", () => {
    expect(parseDays(form({}))).toEqual({ ok: true, open: [], closedDays: [1, 2, 3, 4, 5, 6, 7] });
  });
  test("the field list has exactly 21 names; helpers", () => {
    expect(ALL_FIELD_NAMES).toHaveLength(21);
    expect(clockText("09:00:00")).toBe("09:00");
    expect(clockText("24:00:00")).toBe("24:00");
    expect(toWindows([{ weekday: 1, opens_at: "09:00:00", closes_at: "17:00:00" }])).toEqual([{ weekday: 1, opensAt: "09:00:00", closesAt: "17:00:00" }]);
  });
});

test.describe("source guards for the availability feature", () => {
  const dir = path.join(process.cwd(), "src/features/availability");
  const read = (f: string) => readFileSync(path.join(dir, f), "utf8");
  const actions = read("actions.ts");

  test("the action file is server-only, exports one action, calls requireOwner() first", () => {
    expect(actions.trimStart().startsWith('"use server"')).toBe(true);
    expect(actions).toMatch(/import "server-only"/);
    expect([...actions.matchAll(/export async function (\w+)/g)].map((m) => m[1])).toEqual(["saveAvailability"]);
    const body = actions.slice(actions.indexOf("export async function saveAvailability"));
    expect(body.slice(body.indexOf("{") + 1).trimStart()).toMatch(/^await requireOwner\(\);/);
  });

  test("the lock and ownership checks come before every write", () => {
    const body = actions.slice(actions.indexOf("export async function saveAvailability"));
    const find = body.indexOf("getResource(");
    const lock = body.indexOf("is_locked");
    const firstWrite = Math.min(...[".update(", ".insert(", ".delete("].map((w) => body.indexOf(w)).filter((i) => i >= 0));
    expect(find).toBeGreaterThan(-1);
    expect(lock).toBeGreaterThan(find);
    expect(firstWrite).toBeGreaterThan(lock);
  });

  test("no secret key, no raw database text, only allow-listed fields", () => {
    for (const f of ["actions.ts", "queries.ts"]) expect(read(f), f).not.toMatch(/SUPABASE_SECRET_KEY|service_role|supabase\/admin/i);
    expect(actions).not.toMatch(/\.error\.message/);
    expect(actions).toMatch(/readFields\(formData, ALL_FIELD_NAMES\)/);
  });
});
