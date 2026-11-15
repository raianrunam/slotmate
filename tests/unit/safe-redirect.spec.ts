import { expect, test } from "@playwright/test";
import { DEFAULT_AFTER_LOGIN, safeNext } from "../../src/lib/safe-redirect";

test.describe("safeNext accepts same-site dashboard paths", () => {
  for (const ok of [
    "/dashboard",
    "/dashboard/",
    "/dashboard/bookings",
    "/dashboard/bookings?page=2",
    "/dashboard/analytics?range=30-days&x=1",
  ]) {
    test(ok, () => expect(safeNext(ok)).toBe(ok));
  }
});

test.describe("safeNext refuses everything else (falls back to /dashboard)", () => {
  const attacks: [string, unknown][] = [
    ["protocol-relative", "//evil.com"],
    ["protocol-relative dashboard", "//dashboard"],
    ["backslash host", "/\\evil.com"],
    ["backslash in dashboard path", "/dashboard\\..\\evil"],
    ["https url", "https://evil.com"],
    ["http url", "http://localhost:3000/dashboard"],
    ["javascript scheme", "javascript:alert(1)"],
    ["data scheme", "data:text/html,x"],
    ["encoded slashes", "%2F%2Fevil.com"],
    ["encoded slashes after dashboard", "/dashboard/%2F%2Fevil.com"],
    ["encoded backslash", "/dashboard%5Cevil"],
    ["newline", "/dashboard\n//evil.com"],
    ["carriage return", "/dashboard\r\nSet-Cookie: x=1"],
    ["tab", "/dashboard\t"],
    ["at sign", "/dashboard@evil.com"],
    ["dot dot", "/dashboard/../login"],
    ["dot dot at the end", "/dashboard/.."],
    ["double slash inside", "/dashboard//evil.com"],
    ["not under /dashboard", "/login"],
    ["lookalike prefix", "/dashboardx"],
    ["lookalike prefix with path", "/dashboard-evil/x"],
    ["root", "/"],
    ["empty", ""],
    ["space", "/dashboard /x"],
    ["colon", "/dashboard:80"],
    ["fragment", "/dashboard#x"],
    ["query with a url", "/dashboard?next=https://evil.com"],
    ["very long", `/dashboard/${"a".repeat(300)}`],
    ["undefined", undefined],
    ["null", null],
    ["a number", 5],
    ["an array", ["/dashboard"]],
  ];
  for (const [name, value] of attacks) {
    test(name, () => expect(safeNext(value)).toBe(DEFAULT_AFTER_LOGIN));
  }
});
