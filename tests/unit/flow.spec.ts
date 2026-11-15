import { expect, test } from "@playwright/test";
import {
  destinationForCode,
  destinationForToken,
  failureDestination,
  parseTokenType,
} from "../../src/features/auth/flow";

test.describe("email-link landing helpers", () => {
  test("token types map to FIXED destinations", () => {
    expect(destinationForToken("recovery")).toBe("/reset-password");
    for (const type of ["signup", "email", "magiclink", "invite", "email_change"] as const) {
      expect(destinationForToken(type)).toBe("/dashboard");
    }
  });

  test("unknown token types are refused (including inherited object keys)", () => {
    for (const bad of [null, "", "bogus", "RECOVERY", "__proto__", "constructor", "toString", "https://evil.com"]) {
      expect(parseTokenType(bad)).toBeNull();
    }
    expect(parseTokenType("recovery")).toBe("recovery");
  });

  test("a PKCE code goes to the reset form only when this browser asked for a reset", () => {
    expect(destinationForCode("recovery")).toBe("/reset-password");
    expect(destinationForCode(undefined)).toBe("/dashboard");
    expect(destinationForCode("anything-else")).toBe("/dashboard");
  });

  test("a bad link sends sign-up users to log in and reset users to forgot-password", () => {
    expect(failureDestination(false)).toBe("/login?error=link");
    expect(failureDestination(true)).toBe("/forgot-password?error=link");
  });
});
