import { expect, test } from "@playwright/test";
import {
  addDaysToDate,
  endInstantForWall,
  firstInstantForWall,
  formatClock,
  instantsForWall,
  isBookableStart,
  isoWeekday,
  parseClock,
  slotsForDay,
  slotsForRange,
  todayInZone,
  type AvailabilityWindow,
} from "../../src/lib/time/slots";

// Slot rules (AVAIL-01..05, D5-D8, Q7). These pure functions must agree with the
// database function submit_booking; tests/db/t10-slots-agree.spec.ts proves that
// against the live database. Here: the rules themselves, day by day, including the
// clock-change days of London, New York and Sydney, and Dhaka (no clock changes).

const allDays = (opensAt: string, closesAt: string): AvailabilityWindow[] =>
  [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ weekday, opensAt, closesAt }));

const iso = (d: Date) => d.toISOString().replace(".000Z", "Z");
const starts = (slots: { startsAt: Date }[]) => slots.map((s) => iso(s.startsAt));
const labels = (slots: { start: string }[]) => slots.map((s) => s.start);

test.describe("clock text", () => {
  test("parseClock and formatClock", () => {
    expect(parseClock("09:30")).toBe(34200);
    expect(parseClock("09:30:15")).toBe(34215);
    expect(parseClock("00:00")).toBe(0);
    expect(parseClock("24:00")).toBe(86400);
    expect(parseClock("24:00:00")).toBe(86400);
    for (const bad of ["24:01", "25:00", "9", "09:60", "ab:cd", "", "09:30:61", "-1:00"]) {
      expect(parseClock(bad), bad).toBeNaN();
    }
    expect(formatClock(34200)).toBe("09:30");
    expect(formatClock(86400)).toBe("24:00");
  });
  test("date arithmetic does not depend on the host's time zone (review finding 1)", () => {
    const before = process.env.TZ;
    try {
      for (const hostZone of ["America/New_York", "Australia/Sydney", "Pacific/Kiritimati", "UTC"]) {
        process.env.TZ = hostZone;
        expect(addDaysToDate("2026-03-07", 2), hostZone).toBe("2026-03-09");
        expect(addDaysToDate("2026-10-24", 2), hostZone).toBe("2026-10-26");
        expect(addDaysToDate("2026-04-04", 1), hostZone).toBe("2026-04-05");
        expect(addDaysToDate("2026-12-31", 1), hostZone).toBe("2027-01-01");
        expect(addDaysToDate("2026-03-01", -1), hostZone).toBe("2026-02-28");
      }
    } finally {
      if (before === undefined) delete process.env.TZ;
      else process.env.TZ = before;
    }
  });
  test("dates", () => {
    expect(isoWeekday("2026-11-15")).toBe(7); // a Sunday
    expect(isoWeekday("2026-11-16")).toBe(1); // a Monday
    expect(addDaysToDate("2026-12-30", 3)).toBe("2027-01-02");
    expect(todayInZone("Asia/Dhaka", new Date("2026-06-01T20:00:00Z"))).toBe("2026-06-02"); // +06:00
    expect(todayInZone("America/New_York", new Date("2026-06-01T02:00:00Z"))).toBe("2026-05-31"); // -04:00
  });
});

test.describe("a normal day (Europe/London, summer, no clock change)", () => {
  const now = new Date("2026-06-01T00:00:00Z");
  test("09:00-12:00 with 60-minute slots gives 09:00, 10:00, 11:00 (AVAIL-03 example)", () => {
    const slots = slotsForDay({ slotMinutes: 60, windows: allDays("09:00", "12:00"), date: "2026-06-10", timeZone: "Europe/London", now });
    expect(labels(slots)).toEqual(["09:00", "10:00", "11:00"]);
    expect(starts(slots)).toEqual(["2026-06-10T08:00:00Z", "2026-06-10T09:00:00Z", "2026-06-10T10:00:00Z"]); // BST = UTC+1
    expect(slots[2].end).toBe("12:00");
  });
  test("a leftover shorter than one slot is not offered (09:00-12:30)", () => {
    const slots = slotsForDay({ slotMinutes: 60, windows: allDays("09:00", "12:30"), date: "2026-06-10", timeZone: "Europe/London", now });
    expect(labels(slots)).toEqual(["09:00", "10:00", "11:00"]);
  });
  for (const [minutes, expected] of [
    [30, ["09:00", "09:30", "10:00", "10:30", "11:00", "11:30"]],
    [45, ["09:00", "09:45", "10:30", "11:15"]],
    [60, ["09:00", "10:00", "11:00"]],
    [90, ["09:00", "10:30"]],
  ] as const) {
    test(`${minutes}-minute slots`, () => {
      const slots = slotsForDay({ slotMinutes: minutes, windows: allDays("09:00", "12:00"), date: "2026-06-10", timeZone: "Europe/London", now });
      expect(labels(slots)).toEqual(expected);
    });
  }
  test("a closed weekday (no window) gives no slots; only the listed weekdays open", () => {
    const monday: AvailabilityWindow[] = [{ weekday: 1, opensAt: "09:00", closesAt: "12:00" }];
    const input = { slotMinutes: 60, windows: monday, timeZone: "Europe/London", now };
    expect(slotsForDay({ ...input, date: "2026-06-08" })).toHaveLength(3); // Monday
    expect(slotsForDay({ ...input, date: "2026-06-09" })).toHaveLength(0); // Tuesday
    expect(slotsForDay({ ...input, date: "2026-06-14" })).toHaveLength(0); // Sunday
  });
  test("midnight and 24:00: 00:00-24:00 gives 24 hourly slots, the last one ends at 24:00", () => {
    const slots = slotsForDay({ slotMinutes: 60, windows: allDays("00:00", "24:00"), date: "2026-06-10", timeZone: "Europe/London", now });
    expect(slots).toHaveLength(24);
    expect(slots[0].start).toBe("00:00");
    expect(slots[23].start).toBe("23:00");
    expect(slots[23].end).toBe("24:00");
    expect(iso(slots[23].endsAt)).toBe("2026-06-10T23:00:00Z"); // = 00:00 BST the next day
  });
  test("a bad window (closes not after opens, unreadable text, bad slot length) gives nothing", () => {
    const base = { windows: allDays("12:00", "12:00"), timeZone: "Europe/London", now, date: "2026-06-10" };
    expect(slotsForDay({ ...base, slotMinutes: 60 })).toEqual([]);
    expect(slotsForDay({ ...base, windows: allDays("14:00", "12:00"), slotMinutes: 60 })).toEqual([]);
    expect(slotsForDay({ ...base, windows: allDays("xx", "12:00"), slotMinutes: 60 })).toEqual([]);
    expect(slotsForDay({ ...base, windows: allDays("09:00", "12:00"), slotMinutes: 0 })).toEqual([]);
    expect(slotsForDay({ ...base, windows: allDays("09:00", "12:00"), slotMinutes: 60, date: "2026-02-30" })).toEqual([]);
  });
});

test.describe("past and 90-day limits (D8)", () => {
  const tz = "Europe/London";
  const windows = allDays("09:00", "12:00");
  test("slots that already started, or start exactly now, are not offered", () => {
    const date = "2026-06-10";
    const at = (iso: string) => slotsForDay({ slotMinutes: 60, windows, date, timeZone: tz, now: new Date(iso) });
    expect(labels(at("2026-06-10T08:30:00Z"))).toEqual(["10:00", "11:00"]); // 09:30 BST: 09:00 started
    expect(labels(at("2026-06-10T08:00:00Z"))).toEqual(["10:00", "11:00"]); // exactly 09:00 BST: not "after now"
    expect(labels(at("2026-06-10T07:59:59Z"))).toEqual(["09:00", "10:00", "11:00"]);
    expect(at("2026-06-10T11:00:00Z")).toEqual([]);
  });
  test("day 90 is offered, day 91 is not (counted in the workspace's zone)", () => {
    const now = new Date("2026-06-01T10:00:00Z"); // 11:00 BST on 2026-06-01
    expect(slotsForDay({ slotMinutes: 60, windows, date: "2026-08-30", timeZone: tz, now })).toHaveLength(3); // +90
    expect(slotsForDay({ slotMinutes: 60, windows, date: "2026-08-31", timeZone: tz, now })).toHaveLength(0); // +91
  });
  test("the 90 days follow the zone's calendar date, not UTC's", () => {
    // 2026-06-01 20:00 UTC is still 2026-06-01 in London (21:00 BST) but already 2026-06-02 in Dhaka (02:00).
    const now = new Date("2026-06-01T20:00:00Z");
    const london = { slotMinutes: 60, windows, timeZone: "Europe/London", now };
    expect(slotsForDay({ ...london, date: "2026-08-30" })).toHaveLength(3); // London day 90
    expect(slotsForDay({ ...london, date: "2026-08-31" })).toHaveLength(0);
    const dhaka = { slotMinutes: 60, windows, timeZone: "Asia/Dhaka", now };
    expect(slotsForDay({ ...dhaka, date: "2026-08-31" })).toHaveLength(3); // Dhaka day 90
    expect(slotsForDay({ ...dhaka, date: "2026-09-01" })).toHaveLength(0);
  });
});

test.describe("Europe/London clock changes", () => {
  const tz = "Europe/London";
  test("spring forward 2026-03-29 (01:00 -> 02:00): no slot starts in the skipped hour", () => {
    const now = new Date("2026-03-20T00:00:00Z");
    const slots = slotsForDay({ slotMinutes: 60, windows: allDays("00:00", "04:00"), date: "2026-03-29", timeZone: tz, now });
    expect(labels(slots)).toEqual(["00:00", "02:00", "03:00"]); // 01:00 does not exist
    expect(starts(slots)).toEqual(["2026-03-29T00:00:00Z", "2026-03-29T01:00:00Z", "2026-03-29T02:00:00Z"]);
    // The 00:00 slot ends at wall 01:00 (skipped): resolved like PostgreSQL, one real hour later.
    expect(iso(slots[0].endsAt)).toBe("2026-03-29T01:00:00Z");
  });
  test("clocks back 2026-10-25 (02:00 -> 01:00): the repeated hour is offered once, as its first copy", () => {
    const now = new Date("2026-10-15T00:00:00Z");
    const slots = slotsForDay({ slotMinutes: 60, windows: allDays("00:00", "03:00"), date: "2026-10-25", timeZone: tz, now });
    expect(labels(slots)).toEqual(["00:00", "01:00", "02:00"]);
    // 01:00 means 01:00 BST (= 00:00 UTC), the first copy; 01:00 GMT (= 01:00 UTC) is NOT offered.
    expect(starts(slots)).toEqual(["2026-10-24T23:00:00Z", "2026-10-25T00:00:00Z", "2026-10-25T02:00:00Z"]);
    // Ends use the first copy too: the 00:00 slot ends at 01:00 BST, not 01:00 GMT.
    expect(iso(slots[0].endsAt)).toBe("2026-10-25T00:00:00Z");
    // The 01:00 slot ends at wall 02:00 (GMT): 2 real hours long (allowed, Q7).
    expect(iso(slots[1].endsAt)).toBe("2026-10-25T02:00:00Z");
  });
  test("a full day: 23 slots on the short day, 24 on the long day (hourly, 00:00-24:00)", () => {
    const w = allDays("00:00", "24:00");
    expect(slotsForDay({ slotMinutes: 60, windows: w, date: "2026-03-29", timeZone: tz, now: new Date("2026-03-20T00:00:00Z") })).toHaveLength(23);
    expect(slotsForDay({ slotMinutes: 60, windows: w, date: "2026-10-25", timeZone: tz, now: new Date("2026-10-15T00:00:00Z") })).toHaveLength(24);
  });
});

test.describe("America/New_York clock changes", () => {
  const tz = "America/New_York";
  test("spring forward 2026-03-08 (02:00 -> 03:00)", () => {
    const slots = slotsForDay({ slotMinutes: 60, windows: allDays("00:00", "05:00"), date: "2026-03-08", timeZone: tz, now: new Date("2026-03-01T00:00:00Z") });
    expect(labels(slots)).toEqual(["00:00", "01:00", "03:00", "04:00"]);
    expect(starts(slots)).toEqual(["2026-03-08T05:00:00Z", "2026-03-08T06:00:00Z", "2026-03-08T07:00:00Z", "2026-03-08T08:00:00Z"]);
  });
  test("clocks back 2026-11-01 (02:00 -> 01:00)", () => {
    const slots = slotsForDay({ slotMinutes: 60, windows: allDays("00:00", "03:00"), date: "2026-11-01", timeZone: tz, now: new Date("2026-10-20T00:00:00Z") });
    expect(labels(slots)).toEqual(["00:00", "01:00", "02:00"]);
    expect(starts(slots)).toEqual(["2026-11-01T04:00:00Z", "2026-11-01T05:00:00Z", "2026-11-01T07:00:00Z"]); // 01:00 EDT = 05:00Z (first copy)
  });
});

test.describe("Australia/Sydney clock changes (southern summer)", () => {
  const tz = "Australia/Sydney";
  test("spring forward 2026-10-04 (02:00 -> 03:00)", () => {
    const slots = slotsForDay({ slotMinutes: 60, windows: allDays("00:00", "04:00"), date: "2026-10-04", timeZone: tz, now: new Date("2026-09-20T00:00:00Z") });
    expect(labels(slots)).toEqual(["00:00", "01:00", "03:00"]);
    expect(starts(slots)).toEqual(["2026-10-03T14:00:00Z", "2026-10-03T15:00:00Z", "2026-10-03T16:00:00Z"]);
  });
  test("clocks back 2026-04-05 (03:00 -> 02:00): 02:00-03:00 happens twice, only the first copy is offered", () => {
    const slots = slotsForDay({ slotMinutes: 60, windows: allDays("01:00", "05:00"), date: "2026-04-05", timeZone: tz, now: new Date("2026-03-25T00:00:00Z") });
    expect(labels(slots)).toEqual(["01:00", "02:00", "03:00", "04:00"]);
    // 02:00 AEDT (+11) = 15:00Z the day before (first copy); 03:00 AEST (+10) = 17:00Z.
    expect(starts(slots)).toEqual(["2026-04-04T14:00:00Z", "2026-04-04T15:00:00Z", "2026-04-04T17:00:00Z", "2026-04-04T18:00:00Z"]);
  });
});

test.describe("Asia/Dhaka (no clock changes)", () => {
  const tz = "Asia/Dhaka";
  test("no day is short or long: 24 hourly slots on the dates where other zones change their clocks", () => {
    for (const date of ["2026-03-29", "2026-10-25", "2026-03-08", "2026-11-01", "2026-10-04", "2026-04-05"]) {
      const now = new Date(Date.parse(date + "T00:00:00Z") - 10 * 86400_000);
      const slots = slotsForDay({ slotMinutes: 60, windows: allDays("00:00", "24:00"), date, timeZone: tz, now });
      expect(slots, date).toHaveLength(24);
    }
  });
  test("slots sit at a fixed +06:00 offset", () => {
    const slots = slotsForDay({ slotMinutes: 60, windows: allDays("09:00", "12:00"), date: "2026-02-10", timeZone: tz, now: new Date("2026-02-01T00:00:00Z") });
    expect(starts(slots)).toEqual(["2026-02-10T03:00:00Z", "2026-02-10T04:00:00Z", "2026-02-10T05:00:00Z"]);
  });
});

test.describe("wall time <-> instants", () => {
  test("a repeated, a skipped and a normal wall time", () => {
    const wall = (s: string) => Date.parse(s + "Z");
    expect(instantsForWall(wall("2026-10-25T01:30:00"), "Europe/London")).toHaveLength(2);
    expect(instantsForWall(wall("2026-03-29T01:30:00"), "Europe/London")).toHaveLength(0);
    expect(instantsForWall(wall("2026-06-10T09:00:00"), "Europe/London")).toHaveLength(1);
    expect(firstInstantForWall(wall("2026-03-29T01:30:00"), "Europe/London")).toBeNull();
    expect(new Date(firstInstantForWall(wall("2026-10-25T01:30:00"), "Europe/London")!).toISOString()).toBe("2026-10-25T00:30:00.000Z");
    // End of a slot inside the skipped hour: PostgreSQL's resolution (the offset from before the change).
    expect(new Date(endInstantForWall(wall("2026-03-29T01:30:00"), "Europe/London")).toISOString()).toBe("2026-03-29T01:30:00.000Z");
  });
});

test.describe("isBookableStart agrees with slotsForDay, instant by instant", () => {
  // For each zone and clock-change day, every 5-minute instant across 40 real hours
  // is either an offered slot start (and then bookable with the same end) or refused
  // with invalid_slot (misaligned, second copy of a repeated hour, after closing...).
  const cases = [
    { tz: "Europe/London", date: "2026-03-29", now: "2026-03-20T00:00:00Z" },
    { tz: "Europe/London", date: "2026-10-25", now: "2026-10-15T00:00:00Z" },
    { tz: "America/New_York", date: "2026-03-08", now: "2026-03-01T00:00:00Z" },
    { tz: "America/New_York", date: "2026-11-01", now: "2026-10-20T00:00:00Z" },
    { tz: "Australia/Sydney", date: "2026-10-04", now: "2026-09-20T00:00:00Z" },
    { tz: "Australia/Sydney", date: "2026-04-05", now: "2026-03-25T00:00:00Z" },
    { tz: "Asia/Dhaka", date: "2026-03-29", now: "2026-03-20T00:00:00Z" },
  ];
  for (const { tz, date, now } of cases) {
    for (const slotMinutes of [30, 45, 60, 90]) {
      test(`${tz} ${date}, ${slotMinutes}-minute slots`, () => {
        const windows = allDays("00:30", "24:00");
        const input = { slotMinutes, windows, timeZone: tz, now: new Date(now) };
        const offered = new Map<number, number>();
        for (const day of [addDaysToDate(date, -2), addDaysToDate(date, -1), date, addDaysToDate(date, 1), addDaysToDate(date, 2)]) {
          for (const s of slotsForDay({ ...input, date: day })) offered.set(s.startsAt.getTime(), s.endsAt.getTime());
        }
        const from = Date.parse(date + "T00:00:00Z") - 20 * 3600_000;
        let checked = 0;
        for (let t = from; t < from + 40 * 3600_000; t += 5 * 60_000) {
          const check = isBookableStart({ ...input, startsAt: new Date(t) });
          if (offered.has(t)) {
            expect(check.ok, `${new Date(t).toISOString()} is offered, so it is bookable`).toBe(true);
            if (check.ok) expect(check.endsAt.getTime()).toBe(offered.get(t));
          } else {
            expect(check, `${new Date(t).toISOString()} is not offered, so it is refused`).toEqual({ ok: false, reason: "invalid_slot" });
          }
          checked++;
        }
        expect(checked).toBe(480);
        expect(offered.size, "some slots were offered").toBeGreaterThan(0);
      });
    }
  }

  test("the reasons: past, too far, misaligned, before opening, after closing, closed weekday", () => {
    const tz = "Europe/London";
    const windows: AvailabilityWindow[] = [{ weekday: 3, opensAt: "09:00", closesAt: "12:00" }]; // Wednesdays
    const at = (startsAt: string, nowIso = "2026-06-01T10:00:00Z") =>
      isBookableStart({ slotMinutes: 60, windows, timeZone: tz, now: new Date(nowIso), startsAt: new Date(startsAt) });
    expect(at("2026-06-10T08:00:00Z")).toMatchObject({ ok: true }); // Wed 09:00 BST
    expect(at("2026-06-10T10:00:00Z")).toMatchObject({ ok: true }); // Wed 11:00 BST, ends exactly at closing
    expect(at("2026-06-10T08:30:00Z")).toEqual({ ok: false, reason: "invalid_slot" }); // misaligned
    expect(at("2026-06-10T07:00:00Z")).toEqual({ ok: false, reason: "invalid_slot" }); // 08:00 BST, before opening
    expect(at("2026-06-10T11:00:00Z")).toEqual({ ok: false, reason: "invalid_slot" }); // 12:00 BST, after closing
    expect(at("2026-06-09T08:00:00Z")).toEqual({ ok: false, reason: "invalid_slot" }); // Tuesday: closed
    expect(at("2026-06-03T08:00:00Z", "2026-06-03T09:00:00Z")).toEqual({ ok: false, reason: "past" });
    expect(at("2026-06-03T08:00:00Z", "2026-06-03T08:00:00Z")).toEqual({ ok: false, reason: "past" }); // exactly now
    expect(at("2026-09-02T08:00:00Z")).toEqual({ ok: false, reason: "too_far" }); // 93 days ahead
    // invalid_slot is reported before past (the database checks the slot first).
    expect(at("2026-06-03T08:30:00Z", "2026-06-05T00:00:00Z")).toEqual({ ok: false, reason: "invalid_slot" });
    expect(slotsForRange({ slotMinutes: 60, windows, timeZone: tz, now: new Date("2026-06-01T10:00:00Z"), fromDate: "2026-06-08", days: 7 }).map((d) => d.slots.length)).toEqual([0, 0, 3, 0, 0, 0, 0]);
  });
});
