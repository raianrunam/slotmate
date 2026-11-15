"use server";

import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getEnv } from "@/lib/env";
import { getOwner } from "@/lib/auth";
import { safeNext } from "@/lib/safe-redirect";
import { createClient } from "@/lib/supabase/server";
import { FLOW_COOKIE, RECOVERY_FLOW } from "@/features/auth/flow";
import {
  fieldErrorsFrom,
  forgotPasswordSchema,
  logInSchema,
  readFields,
  resetPasswordSchema,
  signUpSchema,
} from "@/features/auth/schema";
import type { FormState } from "@/features/auth/state";

// Public auth actions (no owner exists yet), so they do not call requireOwner().
// Rules: input comes from FormData only; passwords and emails are never logged;
// messages are fixed strings so they cannot reveal whether an email has an
// account. Server Actions are POST-only and Next.js checks the Origin header
// against the host (CSRF).

const GENERIC_ERROR = "Something went wrong. Please try again.";
const RATE_LIMIT_ERROR =
  "We cannot send another email right now. Please wait a few minutes and try again.";

// Marker for "this browser asked for a password reset" (see flow.ts).
async function setFlowCookie(value: string | null) {
  const store = await cookies();
  if (value === null) {
    store.delete(FLOW_COOKIE);
    return;
  }
  store.set(FLOW_COOKIE, value, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60,
  });
}

function isRateLimit(error: { code?: string; status?: number }) {
  return (
    error.code === "over_email_send_rate_limit" ||
    error.code === "over_request_rate_limit" ||
    error.status === 429
  );
}

export async function signUp(_prev: FormState, formData: FormData): Promise<FormState> {
  const fields = readFields(formData, ["email", "password"]);
  const parsed = signUpSchema.safeParse(fields);
  if (!parsed.success) {
    return {
      status: "error",
      fieldErrors: fieldErrorsFrom(parsed.error),
      email: fields.email.trim(),
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: { emailRedirectTo: `${getEnv().NEXT_PUBLIC_APP_URL}/auth/confirm` },
  });
  if (error) {
    console.error("signUp failed", { code: error.code, status: error.status });
    if (isRateLimit(error)) {
      return { status: "error", message: RATE_LIMIT_ERROR, email: parsed.data.email };
    }
    if (error.code === "weak_password") {
      return {
        status: "error",
        fieldErrors: { password: "Choose a stronger password." },
        email: parsed.data.email,
      };
    }
    return { status: "error", message: GENERIC_ERROR, email: parsed.data.email };
  }

  await setFlowCookie(null);
  // The same text whether or not the address already has an account (AUTH-01).
  return {
    status: "success",
    message:
      "Check your email. If this address can be used, we sent you a link to confirm it. Open the link in this same browser.",
  };
}

export async function logIn(_prev: FormState, formData: FormData): Promise<FormState> {
  const fields = readFields(formData, ["email", "password", "next"]);
  const parsed = logInSchema.safeParse(fields);
  if (!parsed.success) {
    return {
      status: "error",
      fieldErrors: fieldErrorsFrom(parsed.error),
      email: fields.email.trim(),
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });
  if (error) {
    console.error("logIn failed", { code: error.code, status: error.status });
    if (error.code === "email_not_confirmed") {
      // Supabase only says this when the password is right, so it does not
      // reveal which emails exist.
      return {
        status: "error",
        message: "Please confirm your email address first. Check your inbox for the link.",
        email: parsed.data.email,
      };
    }
    if (isRateLimit(error)) {
      return { status: "error", message: "Too many attempts. Please wait a few minutes and try again.", email: parsed.data.email };
    }
    // Wrong email and wrong password give the same text (AUTH-02).
    return { status: "error", message: "Invalid email or password.", email: parsed.data.email };
  }

  redirect(safeNext(fields.next));
}

export async function logOut(): Promise<void> {
  const supabase = await createClient();
  // "local": ends the session in THIS browser only.
  await supabase.auth.signOut({ scope: "local" });
  redirect("/login?notice=logged-out");
}

export async function forgotPassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const fields = readFields(formData, ["email"]);
  const parsed = forgotPasswordSchema.safeParse(fields);
  if (!parsed.success) {
    return { status: "error", fieldErrors: fieldErrorsFrom(parsed.error), email: fields.email.trim() };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${getEnv().NEXT_PUBLIC_APP_URL}/auth/confirm`,
  });
  if (error) {
    // Not shown to the visitor (it could reveal whether the address exists);
    // logged without the address.
    console.error("forgotPassword failed", { code: error.code, status: error.status });
  }
  await setFlowCookie(RECOVERY_FLOW);
  return {
    status: "success",
    message:
      "If an account exists for that address, we sent a link to reset the password. Open the link in this same browser.",
  };
}

export async function resetPassword(_prev: FormState, formData: FormData): Promise<FormState> {
  // Needs the session created by the email link (/auth/confirm).
  if (!(await getOwner())) {
    redirect("/forgot-password?error=expired");
  }

  const fields = readFields(formData, ["password", "confirm"]);
  const parsed = resetPasswordSchema.safeParse(fields);
  if (!parsed.success) {
    return { status: "error", fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    console.error("resetPassword failed", { code: error.code, status: error.status });
    if (error.code === "same_password") {
      return { status: "error", fieldErrors: { password: "Choose a password you have not used before." } };
    }
    if (error.code === "weak_password") {
      return { status: "error", fieldErrors: { password: "Choose a stronger password." } };
    }
    return { status: "error", message: GENERIC_ERROR };
  }

  await supabase.auth.signOut({ scope: "local" });
  await setFlowCookie(null);
  redirect("/login?notice=password-updated");
}
