// Pure helpers for the email-link landing (/auth/confirm). No imports, so they
// are easy to unit test.

// Only the types SlotMate really uses (review finding 4); add more when a
// feature needs them. Which one-time-token types we accept in the token_hash form, and where each
// one lands. Destinations are FIXED paths: no address is ever taken from the
// link (no open redirect).
const TOKEN_TYPE_DESTINATIONS = {
  recovery: "/reset-password",
  signup: "/dashboard",
  email: "/dashboard",
} as const;

export type TokenType = keyof typeof TOKEN_TYPE_DESTINATIONS;

export function parseTokenType(value: string | null): TokenType | null {
  if (value && Object.hasOwn(TOKEN_TYPE_DESTINATIONS, value)) {
    return value as TokenType;
  }
  return null;
}

export function destinationForToken(type: TokenType): string {
  return TOKEN_TYPE_DESTINATIONS[type];
}

// Set by /auth/confirm when a link has opened the password-reset form. The reset
// page and action require it, so an ordinary login session cannot change the
// password without the old one (review finding 3). Lives 15 minutes.
export const RECOVERY_SESSION_COOKIE = "sm_recovery";
export const RECOVERY_SESSION_SECONDS = 15 * 60;

// Used for the PKCE ?code= form, which does not say what kind of email it came
// from. The forgot-password action leaves a short-lived marker cookie in the
// browser that asked for the reset; PKCE only works in that same browser.
export const FLOW_COOKIE = "sm_flow";
export const RECOVERY_FLOW = "recovery";

export function destinationForCode(flowCookie: string | undefined): string {
  return flowCookie === RECOVERY_FLOW ? "/reset-password" : "/dashboard";
}

// Where to go when a link is invalid, used or expired.
export function failureDestination(isRecovery: boolean): string {
  return isRecovery ? "/forgot-password?error=link" : "/login?error=link";
}

export const NOTICES: Record<string, { tone: "success" | "info"; text: string }> = {
  "logged-out": { tone: "success", text: "You have been logged out." },
  "password-updated": {
    tone: "success",
    text: "Your password was changed. Log in with your new password.",
  },
};

export const ERROR_NOTICES: Record<string, string> = {
  link: "This link is invalid or has expired. Request a new one. Open email links in the same browser where you started.",
  expired: "Your reset link has expired. Request a new one.",
};
