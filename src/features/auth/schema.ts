import { z } from "zod";

// Input rules for the auth forms. Pure and shared: no secrets, no imports from
// the server. The password minimum is 8 (D27); the maximum is 72 because the
// password hashing used by Supabase (bcrypt) only reads the first 72 bytes.
// Passwords are NOT trimmed (spaces may be part of a password); emails are.
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 72;

export const MESSAGES = {
  email: "Enter a valid email address.",
  passwordShort: "Use at least 8 characters for your password.",
  passwordLong: "Use at most 72 characters for your password.",
  passwordMissing: "Enter your password.",
  invalidLogin: "Invalid email or password.",
  mismatch: "The two passwords do not match.",
} as const;

const email = z
  .string(MESSAGES.email)
  .trim()
  .toLowerCase()
  .pipe(z.email(MESSAGES.email).max(254, MESSAGES.email));

const newPassword = z
  .string(MESSAGES.passwordShort)
  .min(PASSWORD_MIN, MESSAGES.passwordShort)
  .max(PASSWORD_MAX, MESSAGES.passwordLong);

export const signUpSchema = z.object({ email, password: newPassword });

// No length rule at login: a wrong password is just "Invalid email or password."
export const logInSchema = z.object({
  email,
  password: z
    .string(MESSAGES.passwordMissing)
    .min(1, MESSAGES.passwordMissing)
    .max(PASSWORD_MAX, MESSAGES.invalidLogin), // too long to be right: same text as a wrong password
});

export const forgotPasswordSchema = z.object({ email });

export const resetPasswordSchema = z
  .object({ password: newPassword, confirm: z.string() })
  .refine((v) => v.password === v.confirm, {
    path: ["confirm"],
    message: MESSAGES.mismatch,
  });

export type FieldErrors = Partial<Record<string, string>>;

// Turns a failed zod result into one message per field (the first one).
export function fieldErrorsFrom(error: z.ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    out[key] ??= issue.message;
  }
  return out;
}

// Reads only the named fields from a form, as plain strings.
export function readFields(formData: FormData, names: readonly string[]) {
  const out: Record<string, string> = {};
  for (const name of names) {
    const value = formData.get(name);
    out[name] = typeof value === "string" ? value : "";
  }
  return out;
}
