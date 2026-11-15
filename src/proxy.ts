import { NextResponse, type NextRequest } from "next/server";
import { safeNext } from "@/lib/safe-redirect";
import { readSession } from "@/lib/supabase/proxy";

// Layer 1 of 3 (A3): an optimistic redirect. It is a convenience, NOT the
// security boundary: requireOwner() re-checks with Supabase Auth in every
// dashboard page, and RLS protects the data underneath.
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const isDashboard = pathname === "/dashboard" || pathname.startsWith("/dashboard/");
  const { signedIn, getResponse } = await readSession(request, !isDashboard && pathname !== "/reset-password");

  // Redirects must carry the refreshed login cookies.
  const redirectTo = (url: URL) => {
    const redirect = NextResponse.redirect(url);
    for (const cookie of getResponse().cookies.getAll()) {
      redirect.cookies.set(cookie);
    }
    redirect.headers.set("Cache-Control", "private, no-store");
    return redirect;
  };

  if (isDashboard && !signedIn) {
    const url = new URL("/login", request.url);
    url.searchParams.set("next", safeNext(pathname + search));
    return redirectTo(url);
  }

  // /reset-password is matched only so the login cookies are refreshed there
  // (review finding 9); a signed-in visitor must NOT be bounced away from it.
  if (!isDashboard && signedIn && pathname !== "/reset-password") {
    // /login, /signup, /forgot-password while logged in.
    return redirectTo(new URL("/dashboard", request.url));
  }

  const response = getResponse();
  if (isDashboard) {
    // After logging out, the Back button must not show an old dashboard.
    response.headers.set("Cache-Control", "private, no-store");
  }
  return response;
}

export const config = {
  matcher: ["/dashboard/:path*", "/login", "/signup", "/forgot-password", "/reset-password"],
};
