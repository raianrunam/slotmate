import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  destinationForCode,
  destinationForToken,
  failureDestination,
  FLOW_COOKIE,
  parseTokenType,
  RECOVERY_FLOW,
  RECOVERY_SESSION_COOKIE,
  RECOVERY_SESSION_SECONDS,
} from "@/features/auth/flow";

// The ONLY Route Handler of Phase 7 (A2): where the links in Supabase's emails
// land. Two forms are accepted:
//   ?code=...                      PKCE, the default email links. The code only
//                                  works in the browser that started the
//                                  sign-up or reset (it holds the code verifier).
//   ?token_hash=...&type=...       in case the email templates are customised.
// The destination is always a FIXED path chosen here; the link can never say
// where to go (no open redirect).
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const code = params.get("code");
  const tokenHash = params.get("token_hash");
  const flowCookie = request.cookies.get(FLOW_COOKIE)?.value;
  const wasRecovery = flowCookie === RECOVERY_FLOW;

  // clearFlow: the marker is single-use once a link was really processed. A
  // request with no link in it must not clear it (review finding 6).
  const go = (path: string, clearFlow = true) => {
    const response = NextResponse.redirect(new URL(path, request.url));
    if (clearFlow) response.cookies.delete(FLOW_COOKIE);
    if (path === "/reset-password") {
      response.cookies.set(RECOVERY_SESSION_COOKIE, "1", {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: process.env.NODE_ENV === "production",
        maxAge: RECOVERY_SESSION_SECONDS,
      });
    }
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  };

  // A link Supabase refused (used or expired) arrives with ?error=...
  if (params.has("error") || params.has("error_code")) {
    return go(failureDestination(wasRecovery));
  }

  const supabase = await createClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      console.error("confirm: code exchange failed", { code: error.code, status: error.status });
      return go(failureDestination(wasRecovery));
    }
    return go(destinationForCode(flowCookie));
  }

  if (tokenHash) {
    const type = parseTokenType(params.get("type"));
    if (!type) return go(failureDestination(false));
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (error) {
      console.error("confirm: token check failed", { code: error.code, status: error.status });
      return go(failureDestination(type === "recovery"));
    }
    return go(destinationForToken(type));
  }

  return go(failureDestination(wasRecovery), false);
}
