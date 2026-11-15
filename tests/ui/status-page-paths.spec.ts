import { expect, test } from "@playwright/test";
import { LOGGED_OUT } from "./owner";

// Phase 16 LOW-4, checked on the real production server: an encoded spelling of /booking/<code> is NOT
// routed to the booking status page (so it can never be served without the no-store / no-referrer /
// noindex headers). Only the canonical path serves the status page, and it carries those headers.

test.use({ storageState: LOGGED_OUT });

const CODE = "a".repeat(43);

test("encoded spellings of the status page path are a plain 404, not the status page", async ({ request }) => {
  for (const path of [`/%62ooking/${CODE}`, `/%2562ooking/${CODE}`, `/booking%2F${CODE}`]) {
    const res = await request.get(path);
    expect(res.status(), path).toBe(404);
    expect(await res.text(), path).not.toContain("Booking status");
  }
});

test("the canonical status page path carries the privacy headers", async ({ request }) => {
  const res = await request.get(`/booking/${CODE}`);
  expect(res.status()).toBe(200);
  expect(res.headers()["cache-control"]).toContain("no-store");
  expect(res.headers()["referrer-policy"]).toBe("no-referrer");
  expect(res.headers()["x-robots-tag"]).toContain("noindex");
  expect(res.headers()["x-frame-options"]).toBe("DENY");
});
