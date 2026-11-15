import { expect, test } from "@playwright/test";
import {
  fieldErrorsFrom,
  forgotPasswordSchema,
  logInSchema,
  MESSAGES,
  readFields,
  resetPasswordSchema,
  signUpSchema,
} from "../../src/features/auth/schema";

const GOOD_PASSWORD = "abcdefgh"; // exactly 8

test.describe("signUpSchema", () => {
  test("accepts a valid email and an 8-character password", () => {
    const r = signUpSchema.safeParse({ email: "owner@example.com", password: GOOD_PASSWORD });
    expect(r.success).toBe(true);
  });

  test("refuses a 7-character password with the fixed message (D27)", () => {
    const r = signUpSchema.safeParse({ email: "owner@example.com", password: "abcdefg" });
    expect(r.success).toBe(false);
    if (!r.success) expect(fieldErrorsFrom(r.error).password).toBe(MESSAGES.passwordShort);
  });

  test("accepts 72 characters and refuses 73", () => {
    expect(signUpSchema.safeParse({ email: "a@b.co", password: "x".repeat(72) }).success).toBe(true);
    const r = signUpSchema.safeParse({ email: "a@b.co", password: "x".repeat(73) });
    expect(r.success).toBe(false);
    if (!r.success) expect(fieldErrorsFrom(r.error).password).toBe(MESSAGES.passwordLong);
  });

  test("trims and lower-cases the email", () => {
    const r = signUpSchema.parse({ email: "  Owner@Example.COM  ", password: GOOD_PASSWORD });
    expect(r.email).toBe("owner@example.com");
  });

  test("does not trim the password", () => {
    const r = signUpSchema.parse({ email: "a@b.co", password: "  spaced  " });
    expect(r.password).toBe("  spaced  ");
  });

  for (const bad of ["", "   ", "plain", "a@", "@b.co", "a b@c.co", "a@b", "a@@b.co"]) {
    test(`refuses the email ${JSON.stringify(bad)}`, () => {
      const r = signUpSchema.safeParse({ email: bad, password: GOOD_PASSWORD });
      expect(r.success).toBe(false);
      if (!r.success) expect(fieldErrorsFrom(r.error).email).toBe(MESSAGES.email);
    });
  }

  test("refuses an email longer than 254 characters", () => {
    const long = `${"a".repeat(250)}@example.com`;
    expect(signUpSchema.safeParse({ email: long, password: GOOD_PASSWORD }).success).toBe(false);
  });

  test("a missing field gives a message, not a crash", () => {
    const r = signUpSchema.safeParse({});
    expect(r.success).toBe(false);
  });
});

test.describe("logInSchema", () => {
  test("has no minimum length (a wrong password is just wrong)", () => {
    expect(logInSchema.safeParse({ email: "a@b.co", password: "x" }).success).toBe(true);
  });
  test("refuses an empty password", () => {
    const r = logInSchema.safeParse({ email: "a@b.co", password: "" });
    expect(r.success).toBe(false);
  });
  test("refuses a password over 72 characters", () => {
    expect(logInSchema.safeParse({ email: "a@b.co", password: "x".repeat(73) }).success).toBe(false);
  });
});

test.describe("forgotPasswordSchema", () => {
  test("needs a valid email only", () => {
    expect(forgotPasswordSchema.safeParse({ email: "a@b.co" }).success).toBe(true);
    expect(forgotPasswordSchema.safeParse({ email: "nope" }).success).toBe(false);
  });
});

test.describe("resetPasswordSchema", () => {
  test("accepts matching passwords of 8 to 72 characters", () => {
    expect(resetPasswordSchema.safeParse({ password: GOOD_PASSWORD, confirm: GOOD_PASSWORD }).success).toBe(true);
  });
  test("refuses passwords that do not match", () => {
    const r = resetPasswordSchema.safeParse({ password: GOOD_PASSWORD, confirm: "different1" });
    expect(r.success).toBe(false);
    if (!r.success) expect(fieldErrorsFrom(r.error).confirm).toBe(MESSAGES.mismatch);
  });
  test("refuses a short new password", () => {
    const r = resetPasswordSchema.safeParse({ password: "short", confirm: "short" });
    expect(r.success).toBe(false);
    if (!r.success) expect(fieldErrorsFrom(r.error).password).toBe(MESSAGES.passwordShort);
  });
});

test.describe("readFields", () => {
  test("reads only the named text fields and ignores everything else", () => {
    const form = new FormData();
    form.set("email", "a@b.co");
    form.set("owner_id", "attacker-chosen");
    form.set("file", new Blob(["x"]), "x.txt");
    const out = readFields(form, ["email", "file", "missing"]);
    expect(out).toEqual({ email: "a@b.co", file: "", missing: "" });
  });
});
