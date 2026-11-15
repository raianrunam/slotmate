import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createHash, createHmac } from "node:crypto";
import { BOOKING_MESSAGES, mapBookingError } from "../../src/features/public-booking/errors";
import { bookingSchema, parseBooking, STATUS_CODE, type RawFields } from "../../src/features/public-booking/schema";
import { clockIn, dateIn, dateLabel, zoneLabel } from "../../src/lib/time/format";
import { clientAddress, keyedHash, LOCAL_ADDRESS, normaliseAddress } from "../../src/lib/rate-limit-hash";
import { dropOverlappingSlots, dropTakenSlots, slotsForDay, type Slot } from "../../src/lib/time/slots";

// Phase 11: the public booking rules that need no browser, server or database.

const read = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8");

const good: RawFields = {
  resourceId: "6f1c1f3e-0f55-4c46-9a1b-7b2d4f0f9e11",
  startsAt: "2026-11-17T10:00:00.000Z",
  name: "  Ada Lovelace ",
  email: " ada@example.com ",
  phone: "",
  note: "",
  attendees: "2",
};

test.describe("booking form rules (PUB-04, D11, limits match the database CHECKs)", () => {
  test("a valid form is accepted, trimmed, and empty optional fields become null", () => {
    expect(parseBooking(good, 5)).toEqual({
      ok: true,
      data: {
        resourceId: good.resourceId,
        startsAt: "2026-11-17T10:00:00.000Z",
        name: "Ada Lovelace",
        email: "ada@example.com",
        phone: null,
        note: null,
        attendees: 2,
      },
    });
  });
  test("name: required, at most 100", () => {
    expect(parseBooking({ ...good, name: "   " }, 5)).toMatchObject({ ok: false, errors: { name: expect.any(String) } });
    expect(parseBooking({ ...good, name: "x".repeat(100) }, 5).ok).toBe(true);
    expect(parseBooking({ ...good, name: "x".repeat(101) }, 5).ok).toBe(false);
  });
  test("email: must be an address, at most 254", () => {
    for (const email of ["", "nope", "a@", "@b.com", "a b@c.com"]) expect(parseBooking({ ...good, email }, 5).ok, email).toBe(false);
    expect(parseBooking({ ...good, email: `${"a".repeat(250)}@b.co` }, 5).ok).toBe(false);
  });
  test("attendees: whole number from 1 to the capacity", () => {
    for (const attendees of ["0", "-1", "1.5", "abc", "", "6", "99999"]) {
      expect(parseBooking({ ...good, attendees }, 5), attendees).toMatchObject({ ok: false, errors: { attendees: expect.any(String) } });
    }
    for (const attendees of ["1", "5"]) expect(parseBooking({ ...good, attendees }, 5).ok).toBe(true);
    expect(parseBooking({ ...good, attendees: "2" }, 1)).toMatchObject({ ok: false, errors: { attendees: "This resource is for 1 person." } });
  });
  test("phone: optional, at most 30, digits and + ( ) - . only; note at most 1000", () => {
    expect(parseBooking({ ...good, phone: "+44 (0)20 7946 0958" }, 5).ok).toBe(true);
    expect(parseBooking({ ...good, phone: "call me" }, 5).ok).toBe(false);
    expect(parseBooking({ ...good, phone: "1".repeat(31) }, 5).ok).toBe(false);
    expect(parseBooking({ ...good, note: "n".repeat(1000) }, 5).ok).toBe(true);
    expect(parseBooking({ ...good, note: "n".repeat(1001) }, 5).ok).toBe(false);
  });
  test("start time: only an exact moment with at most milliseconds; always sent to the database normalised (#17)", () => {
    expect(parseBooking({ ...good, startsAt: "2026-11-17T10:00:00Z" }, 5)).toMatchObject({ ok: true, data: { startsAt: "2026-11-17T10:00:00.000Z" } });
    expect(parseBooking({ ...good, startsAt: "2026-11-17T10:00:00.5Z" }, 5)).toMatchObject({ ok: true, data: { startsAt: "2026-11-17T10:00:00.500Z" } });
    // sub-millisecond, a local time without zone, an offset, a date alone, junk, an impossible date
    const bad = ["2026-11-17T10:00:00.0005Z", "2026-11-17T10:00:00.000000Z", "2026-11-17T10:00:00", "2026-11-17T10:00:00+01:00", "2026-11-17", "tomorrow", "", "2026-13-45T10:00:00Z"];
    for (const startsAt of bad) {
      expect(parseBooking({ ...good, startsAt }, 5), startsAt).toMatchObject({ ok: false, errors: { startsAt: expect.any(String) } });
    }
  });
  test("a NUL character is refused in name and note", () => {
    const nul = String.fromCharCode(0);
    expect(parseBooking({ ...good, name: `Ada${nul}` }, 5).ok).toBe(false);
    expect(parseBooking({ ...good, note: `x${nul}y` }, 5).ok).toBe(false);
  });
  test("resource id must be a uuid; every bad field is reported at once", () => {
    expect(parseBooking({ ...good, resourceId: "x" }, 5)).toMatchObject({ ok: false, errors: { resourceId: expect.any(String) } });
    const r = parseBooking({ ...good, name: "", email: "x", attendees: "0" }, 5);
    expect(r.ok === false && Object.keys(r.errors).sort()).toEqual(["attendees", "email", "name"]);
    expect(bookingSchema(3)).toBeTruthy();
  });
});

test.describe("error mapping (AVAIL-05, PUB-06)", () => {
  test("every database refusal name has its own friendly message", () => {
    for (const name of ["slot_taken", "limit_reached", "not_bookable", "invalid_slot", "past", "too_far", "too_many_attendees"] as const) {
      expect(mapBookingError({ code: "P0001", message: name }), name).toBe(name);
      expect(BOOKING_MESSAGES[name].length).toBeGreaterThan(10);
    }
    expect(BOOKING_MESSAGES.slot_taken).toMatch(/just taken/i);
    expect(BOOKING_MESSAGES.limit_reached).toMatch(/not accepting/i);
    expect(BOOKING_MESSAGES.rate_limited).toMatch(/too many requests.*few minutes/i);
  });
  test("other errors are generic, and raw database text is never in a message", () => {
    expect(mapBookingError({ code: "23P01", message: "conflicting key value violates exclusion constraint" })).toBe("slot_taken");
    expect(mapBookingError({ code: "23514", message: "new row violates check constraint bookings_name" })).toBe("invalid_values");
    expect(mapBookingError({ code: "40P01", message: "deadlock detected" })).toBe("unknown");
    expect(mapBookingError({ code: "XX000", message: "the pastime of a foreign country" })).toBe("unknown");
    expect(mapBookingError({ code: "P0001", message: "invalid value for past" })).toBe("unknown"); // exact names only
    for (const text of Object.values(BOOKING_MESSAGES)) expect(text).not.toMatch(/constraint|postgres|sql|violates|_/i);
  });
});

test.describe("slot lists a visitor sees", () => {
  const mk = (startIso: string, endIso: string): Slot => ({ startsAt: new Date(startIso), endsAt: new Date(endIso), date: "", start: "", end: "" });

  test("a taken range removes exactly the overlapping slots; back-to-back is free", () => {
    const slots = [
      mk("2026-11-17T09:00:00Z", "2026-11-17T10:00:00Z"),
      mk("2026-11-17T10:00:00Z", "2026-11-17T11:00:00Z"),
      mk("2026-11-17T11:00:00Z", "2026-11-17T12:00:00Z"),
    ];
    const taken = [{ startsAt: new Date("2026-11-17T10:00:00Z"), endsAt: new Date("2026-11-17T11:00:00Z") }];
    expect(dropTakenSlots(slots, taken).map((s) => s.startsAt.toISOString())).toEqual(["2026-11-17T09:00:00.000Z", "2026-11-17T11:00:00.000Z"]);
    // a booking of a different length (the owner changed the slot length) still blocks every slot it overlaps
    const long = [{ startsAt: new Date("2026-11-17T09:30:00Z"), endsAt: new Date("2026-11-17T11:30:00Z") }];
    expect(dropTakenSlots(slots, long)).toEqual([]);
    expect(dropTakenSlots(slots, [])).toHaveLength(3);
  });

  test("45-minute slots on the spring-forward day: a slot overlapping an earlier offered one is hidden (#26)", () => {
    // London, Sunday 29 March 2026: 01:00 to 02:00 does not exist. Window 00:00 to 06:00, 45-minute slots.
    const day = slotsForDay({
      slotMinutes: 45,
      windows: [{ weekday: 7, opensAt: "00:00", closesAt: "06:00" }],
      timeZone: "Europe/London",
      date: "2026-03-29",
      now: new Date("2026-03-01T00:00:00Z"),
    });
    const hidden = dropOverlappingSlots(day);
    const overlaps = (list: Slot[]) => list.some((s, i) => i > 0 && s.startsAt.getTime() < list[i - 1].endsAt.getTime());
    expect(overlaps(day), "the raw list has the known overlap").toBe(true);
    expect(overlaps(hidden)).toBe(false);
    expect(hidden.length).toBeLessThan(day.length);
    // An ordinary day loses nothing.
    const normal = slotsForDay({
      slotMinutes: 45,
      windows: [{ weekday: 1, opensAt: "09:00", closesAt: "12:00" }],
      timeZone: "Europe/London",
      date: "2026-11-16",
      now: new Date("2026-11-01T00:00:00Z"),
    });
    expect(normal.length).toBeGreaterThan(0);
    expect(dropOverlappingSlots(normal)).toHaveLength(normal.length);
  });
});

test.describe("words and zones", () => {
  test("the zone is always named", () => {
    expect(zoneLabel("Europe/London")).toBe("London time (Europe/London)");
    expect(zoneLabel("America/New_York")).toBe("New York time (America/New_York)");
    expect(zoneLabel("UTC")).toBe("UTC");
  });
  test("times are shown in the workspace's zone, never the host's", () => {
    expect(clockIn("2026-07-01T09:00:00Z", "Europe/London")).toBe("10:00");
    expect(clockIn("2026-12-01T09:00:00Z", "Europe/London")).toBe("09:00");
    expect(clockIn("2026-12-01T00:30:00Z", "Asia/Kolkata")).toBe("06:00");
    expect(clockIn("2026-12-01T23:30:00Z", "UTC")).toBe("23:30");
    expect(dateIn("2026-12-01T23:30:00Z", "Asia/Tokyo")).toBe("2026-12-02");
    expect(dateLabel("2026-11-17")).toBe("Tuesday 17 November");
    expect(dateLabel("2026-11-17", true)).toBe("Tuesday 17 November 2026");
  });
});

test.describe("rate limit hashing (DB11, A9)", () => {
  test("the first x-forwarded-for value is used; a missing header uses one fixed value", () => {
    const h = (v?: string) => ({ get: (n: string) => (n === "x-forwarded-for" ? (v ?? null) : null) });
    expect(clientAddress(h("203.0.113.9, 10.0.0.1"))).toBe("203.0.113.9");
    expect(clientAddress(h(" 2001:DB8::1 "))).toBe("2001:0db8:0000:0000::/64");
    expect(clientAddress(h())).toBe(LOCAL_ADDRESS);
    expect(clientAddress(h(""))).toBe(LOCAL_ADDRESS);
    expect(clientAddress(h("x".repeat(101)))).toBe(LOCAL_ADDRESS);
  });
  test("IPv6: one visitor is one /64 block; spellings and IPv4-mapped forms are the same key (review finding 3)", () => {
    const same = ["2001:db8:1:2::1", "2001:DB8:1:2:ffff:ffff:ffff:ffff", "2001:0db8:0001:0002:0000:0000:0000:0001", "[2001:db8:1:2::abcd]", "2001:db8:1:2:3:4:5:6%eth0"];
    const keys = new Set(same.map(normaliseAddress));
    expect([...keys]).toEqual(["2001:0db8:0001:0002::/64"]);
    expect(normaliseAddress("2001:db8:1:3::1")).not.toBe(normaliseAddress("2001:db8:1:2::1"));
    expect(normaliseAddress("::ffff:203.0.113.9")).toBe("203.0.113.9");
    expect(normaliseAddress("0:0:0:0:0:ffff:203.0.113.9")).toBe("203.0.113.9");
    expect(normaliseAddress("203.0.113.9")).toBe("203.0.113.9");
    expect(normaliseAddress("::1")).toBe("0000:0000:0000:0000::/64");
    expect(normaliseAddress("not-an-address:::")).toBe("not-an-address:::");
  });
  test("the hash is HMAC-SHA256 with the secret: 32 bytes, stable, different per secret and address, never the address", () => {
    const a = keyedHash("secret-one", "203.0.113.9");
    expect(a).toMatch(/^\\x[0-9a-f]{64}$/);
    expect(a).toBe(`\\x${createHmac("sha256", "secret-one").update("203.0.113.9").digest("hex")}`);
    expect(keyedHash("secret-one", "203.0.113.9")).toBe(a);
    expect(keyedHash("secret-two", "203.0.113.9")).not.toBe(a);
    expect(keyedHash("secret-one", "203.0.113.10")).not.toBe(a);
    expect(a).not.toContain("203.0");
  });
});

test.describe("status code (A8)", () => {
  test("a 32-byte base64url code is exactly 43 characters and its hash is a 32-byte SHA-256", () => {
    const code = Buffer.alloc(32, 7).toString("base64url");
    expect(code).toHaveLength(43);
    expect(STATUS_CODE.test(code)).toBe(true);
    for (const bad of ["", "short", `${code}x`, `${code.slice(0, 42)}!`, `${code.slice(0, 42)}/`]) expect(STATUS_CODE.test(bad), bad).toBe(false);
    expect(createHash("sha256").update(code).digest()).toHaveLength(32);
  });
});

test.describe("source guards for the public booking feature", () => {
  const actions = read("src/features/public-booking/actions.ts");
  const queries = read("src/features/public-booking/queries.ts");
  const limit = read("src/lib/rate-limit.ts");

  test("server-only modules; the action file is 'use server' and exports exactly two async functions", () => {
    expect(actions.trimStart().startsWith('"use server"')).toBe(true);
    for (const f of ["src/features/public-booking/actions.ts", "src/features/public-booking/queries.ts", "src/lib/rate-limit.ts"]) {
      expect(read(f), f).toMatch(/^import "server-only"/m);
    }
    const exported = [...actions.matchAll(/^export (async function|function|const|let|class|type|interface)\s+(\w+)/gm)];
    expect(exported.map((m) => `${m[1]} ${m[2]}`)).toEqual(["async function submitBooking", "async function loadDaySlots"]);
  });
  test("submitBooking order: allow-listed fields, rate limit, validation, random code, submit_booking, redirect", () => {
    const order = ["readRaw(formData)", "checkRate(", "parseBooking(", "randomBytes(32)", 'rpc("submit_booking"', "redirect("].map((t) => actions.indexOf(t));
    expect(order.every((i) => i > 0), "every step is present").toBe(true);
    expect([...order].sort((a, b) => a - b), "in this order").toEqual(order);
  });
  test("only the hash of the status code goes to the database", () => {
    expect(actions).toMatch(/p_status_token_hash: hash/);
    expect(actions).not.toMatch(/p_status_token_hash: code/);
  });
  test("nothing personal is logged: log calls carry fixed text and error codes only", () => {
    for (const [name, text] of [["actions", actions], ["queries", queries], ["rate-limit", limit]] as const) {
      for (const m of text.matchAll(/console\.\w+\(([^;]*)\);/g)) {
        expect(m[1], `${name}: ${m[1]}`).not.toMatch(/address|headers|forwarded|email|phone|note|raw|input|formData|\bip\b|\bhash\b|\bcode\)/i);
      }
    }
  });
  test("the visitor-facing reads never select contact details; the owner id is not returned", () => {
    const selects = [...queries.matchAll(/\.select\(("[^"]*")/g)].map((m) => m[1]).join(" ");
    expect(selects.length).toBeGreaterThan(100);
    expect(selects).not.toMatch(/visitor_email|visitor_phone|note/);
    expect(queries).toMatch(/\.select\("id, resource_id, starts_at, ends_at, status"\)/);
    const returned = queries.slice(queries.indexOf("return {\n    name: workspace.data.name"), queries.indexOf("export async function getDaySlots"));
    expect(returned).not.toMatch(/owner/i);
  });
  test("the status page is noindex, no-referrer, and next.config sends no-store for /booking/*", () => {
    const page = read("src/app/booking/[code]/page.tsx");
    expect(page).toMatch(/robots: \{ index: false, follow: false \}/);
    expect(page).toMatch(/referrer: "no-referrer"/);
    const config = read("next.config.ts");
    expect(config).toMatch(/source: "\/booking\/:code"/);
    expect(config).toMatch(/no-store/);
    expect(config).toMatch(/\{ key: "Referrer-Policy", value: "no-referrer" \}/);
  });
});
