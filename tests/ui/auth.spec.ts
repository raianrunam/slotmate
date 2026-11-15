import { expect, test, type Page } from "@playwright/test";
import { serviceClient } from "../db/helpers";
import {
  createTestUser,
  deleteTestUser,
  LOGGED_OUT,
  newTestAddress,
  newTestPassword,
  userExists,
  type TestUser,
} from "./owner";

// Authentication checks (Phase 7). Nobody is logged in at the start of each test.
// No real email is ever sent (A20): owners are made with auth.admin.createUser,
// and email links are made with auth.admin.generateLink, which only returns the
// link. Only addresses that start with "slotmate-test-" are used; the ones that
// do not exist are never sent to Supabase's email system with a real owner.

test.use({ storageState: LOGGED_OUT });

const createdIds: string[] = [];
async function newUser(confirmed = true): Promise<TestUser> {
  const user = await createTestUser({ confirmed });
  createdIds.push(user.id);
  return user;
}
test.afterAll(async () => {
  for (const id of createdIds) await deleteTestUser(id);
});

async function logIn(page: Page, user: { email: string; password: string }) {
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password").fill(user.password);
  await page.getByRole("button", { name: "Log in" }).click();
}

const INVALID = "Invalid email or password.";

// Next.js adds its own role=alert route announcer, so look at our messages only.
const alertIn = (page: Page) => page.locator("[role=alert]:not(#__next-route-announcer__)");

test.describe("protected dashboard", () => {
  test("logged-out visitors are redirected to /login with a safe ?next=", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login\?next=%2Fdashboard$/);
    await page.goto("/dashboard/bookings");
    await expect(page).toHaveURL(/\/login\?next=%2Fdashboard%2Fbookings$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Log in");
  });

  for (const route of ["workspaces", "resources", "availability", "analytics", "widget", "billing"]) {
    test(`logged-out /dashboard/${route} is redirected`, async ({ page }) => {
      await page.goto(`/dashboard/${route}`);
      await expect(page).toHaveURL(/\/login\?next=/);
    });
  }

  test("a made-up login cookie does not open the dashboard", async ({ page, context }) => {
    await context.addCookies([
      { name: "sb-fake-auth-token", value: "garbage", url: "http://localhost:3100" },
    ]);
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe("log in and out", () => {
  test("login with an admin-created owner opens the dashboard and shows the email", async ({ page }) => {
    const user = await newUser();
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/login");
    await logIn(page, user);
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByTestId("owner-email")).toHaveText(user.email);

    // The session survives a reload.
    await page.reload();
    await expect(page.getByTestId("owner-email")).toHaveText(user.email);

    // The menu also shows the email.
    await page.getByRole("button", { name: "Account menu" }).click();
    await expect(page.getByRole("menu")).toContainText(user.email);
  });

  test("login cookies are httpOnly and not readable by page scripts (AUTH-05)", async ({ page, context }) => {
    const user = await newUser();
    await page.goto("/login");
    await logIn(page, user);
    await expect(page).toHaveURL(/\/dashboard$/);

    const authCookies = (await context.cookies()).filter((c) => c.name.startsWith("sb-"));
    expect(authCookies.length, "login cookies exist").toBeGreaterThan(0);
    for (const c of authCookies) {
      expect(c.httpOnly, `${c.name} is httpOnly`).toBe(true);
      expect(c.sameSite, `${c.name} sameSite`).toBe("Lax");
      expect(c.path).toBe("/");
    }
    const visible = await page.evaluate(() => document.cookie);
    expect(visible, "document.cookie shows no login cookie").not.toContain("sb-");
  });

  test("dashboard responses are not cached (Back after logout shows no old page)", async ({ page }) => {
    const user = await newUser();
    await page.goto("/login");
    await logIn(page, user);
    const response = await page.goto("/dashboard");
    expect(response?.headers()["cache-control"]).toContain("no-store");
  });

  test("after login the owner lands on the page they asked for", async ({ page }) => {
    const user = await newUser();
    await page.goto("/dashboard/bookings");
    await expect(page).toHaveURL(/\/login\?next=%2Fdashboard%2Fbookings$/);
    await logIn(page, user);
    await expect(page).toHaveURL(/\/dashboard\/bookings$/);
  });

  test("a wrong password and an unknown email give the identical message", async ({ page }) => {
    const user = await newUser();
    await page.goto("/login");
    await logIn(page, { email: user.email, password: `${newTestPassword()}x` });
    const wrongPassword = alertIn(page).filter({ hasText: INVALID });
    await expect(wrongPassword).toHaveText(INVALID);
    await expect(page).toHaveURL(/\/login$/);

    await page.goto("/login");
    await logIn(page, { email: newTestAddress(), password: newTestPassword() });
    const unknownEmail = alertIn(page).filter({ hasText: INVALID });
    await expect(unknownEmail).toHaveText(INVALID);
  });

  test("an owner who has not confirmed the email is told to confirm", async ({ page }) => {
    const user = await newUser(false);
    await page.goto("/login");
    await logIn(page, user);
    await expect(alertIn(page)).toContainText("confirm your email");
    await expect(page).toHaveURL(/\/login$/);
  });

  test("an empty form shows field messages", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page.locator("#login-email-error")).toHaveText("Enter a valid email address.");
    await expect(page.locator("#login-password-error")).toHaveText("Enter your password.");
  });

  test("logout ends the session; /dashboard redirects again; Back shows no dashboard", async ({ page }) => {
    const user = await newUser();
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/login");
    await logIn(page, user);
    await expect(page).toHaveURL(/\/dashboard$/);

    await page.getByRole("button", { name: "Account menu" }).click();
    await page.getByRole("menuitem", { name: "Log out" }).click();
    await expect(page).toHaveURL(/\/login\?notice=logged-out$/);
    await expect(page.getByTestId("page-notice")).toHaveText("You have been logged out.");

    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login\?next=/);

    await page.goBack();
    await expect(page.getByTestId("owner-email")).toHaveCount(0);
    await page.goto("/dashboard/bookings");
    await expect(page).toHaveURL(/\/login\?next=/);
  });

  test("a logged-in owner visiting /login or /signup goes to the dashboard", async ({ page }) => {
    const user = await newUser();
    await page.goto("/login");
    await logIn(page, user);
    await expect(page).toHaveURL(/\/dashboard$/);
    await page.goto("/login");
    await expect(page).toHaveURL(/\/dashboard$/);
    await page.goto("/signup");
    await expect(page).toHaveURL(/\/dashboard$/);
  });
});

test.describe("open redirects", () => {
  for (const next of [
    "//evil.com",
    "https://evil.com",
    "/\\evil.com",
    "%2F%2Fevil.com",
    "/login",
    "javascript:alert(1)",
    "/dashboard/../login",
  ]) {
    test(`?next=${next} lands on /dashboard`, async ({ page }) => {
      const user = await newUser();
      await page.goto(`/login?next=${encodeURIComponent(next)}`);
      await logIn(page, user);
      await expect(page).toHaveURL(/localhost:3100\/dashboard$/);
    });
  }
});

test.describe("sign up and forgot password (forms only: no email is sent)", () => {
  test("a 7-character password is refused and nothing is created", async ({ page }) => {
    const email = newTestAddress();
    await page.goto("/signup");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill("abcdefg");
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.locator("#signup-password-error")).toHaveText(
      "Use at least 8 characters for your password.",
    );
    await expect(page.getByTestId("signup-success")).toHaveCount(0);
    expect(await userExists(email), "no account was created").toBe(false);
  });

  test("an invalid email is refused and nothing is created", async ({ page }) => {
    await page.goto("/signup");
    await page.getByLabel("Email").fill("not-an-email");
    await page.getByLabel("Password").fill("abcdefgh1");
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.locator("#signup-email-error")).toHaveText("Enter a valid email address.");
  });

  test("forgot password: an invalid email is refused", async ({ page }) => {
    await page.goto("/forgot-password");
    await page.getByLabel("Email").fill("nope");
    await page.getByRole("button", { name: "Send reset link" }).click();
    await expect(page.locator("#forgot-email-error")).toHaveText("Enter a valid email address.");
  });

  test("forgot password shows the generic message for an address that does not exist", async ({ page }) => {
    await page.goto("/forgot-password");
    await page.getByLabel("Email").fill(newTestAddress());
    await page.getByRole("button", { name: "Send reset link" }).click();
    await expect(page.getByTestId("forgot-success")).toContainText(
      "If an account exists for that address, we sent a link to reset the password.",
    );
    // The marker cookie is hidden from page scripts and not sent cross-site.
    const flow = (await page.context().cookies()).find((c) => c.name === "sm_flow");
    expect(flow?.httpOnly, "sm_flow is httpOnly").toBe(true);
    expect(flow?.sameSite, "sm_flow sameSite").toBe("Lax");
  });

  test("sign-up for an address that already has an account shows the same message", async ({ page }) => {
    const user = await newUser();
    await page.goto("/signup");
    await page.getByLabel("Email").fill(user.email);
    await page.getByLabel("Password").fill(newTestPassword());
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByTestId("signup-success")).toContainText(
      "Check your email. If this address can be used, we sent you a link to confirm it.",
    );
  });
});

test.describe("/auth/confirm (email-link landing)", () => {
  test("no parameters, an unknown type, a bad token and a bad code all go to /login?error=link", async ({ page }) => {
    for (const query of [
      "",
      "?token_hash=abc&type=bogus",
      "?token_hash=abc&type=email",
      "?code=not-a-real-code",
      "?error=access_denied&error_code=otp_expired",
    ]) {
      await page.goto(`/auth/confirm${query}`);
      await expect(page, query).toHaveURL(/\/login\?error=link$/);
      await expect(page.getByTestId("page-error")).toContainText("invalid or has expired");
    }
  });

  test("the link cannot choose where to go (no open redirect)", async ({ page }) => {
    await page.goto("/auth/confirm?next=https://evil.com&redirect_to=https://evil.com&token_hash=x&type=email");
    await expect(page).toHaveURL(/localhost:3100\/login\?error=link$/);
  });

  test("a recovery link opens the reset form; the new password works, the old one does not; the link cannot be reused", async ({ page }) => {
    const user = await newUser();
    const { data, error } = await serviceClient().auth.admin.generateLink({
      type: "recovery",
      email: user.email,
    });
    expect(error).toBeNull();
    const tokenHash = data?.properties?.hashed_token;
    expect(tokenHash, "generateLink returned a token").toBeTruthy();

    await page.goto(`/auth/confirm?token_hash=${tokenHash}&type=recovery`);
    await expect(page).toHaveURL(/\/reset-password$/);

    // Short and mismatching passwords are refused.
    await page.getByLabel("New password", { exact: true }).fill("short");
    await page.getByLabel("Confirm new password").fill("short");
    await page.getByRole("button", { name: "Save password" }).click();
    await expect(page.locator("#reset-password-error")).toHaveText(
      "Use at least 8 characters for your password.",
    );
    const fresh = newTestPassword();
    await page.getByLabel("New password", { exact: true }).fill(fresh);
    await page.getByLabel("Confirm new password").fill(`${fresh}-different`);
    await page.getByRole("button", { name: "Save password" }).click();
    await expect(page.locator("#reset-password-confirm-error")).toHaveText(
      "The two passwords do not match.",
    );

    await page.getByLabel("New password", { exact: true }).fill(fresh);
    await page.getByLabel("Confirm new password").fill(fresh);
    await page.getByRole("button", { name: "Save password" }).click();
    await expect(page).toHaveURL(/\/login\?notice=password-updated$/);
    await expect(page.getByTestId("page-notice")).toContainText("Your password was changed");

    // Signed out after the reset: the dashboard is closed.
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login\?next=/);

    // The old password stops working; the new one works.
    await page.goto("/login");
    await logIn(page, user);
    await expect(alertIn(page)).toHaveText(INVALID);
    await page.goto("/login");
    await logIn(page, { email: user.email, password: fresh });
    await expect(page).toHaveURL(/\/dashboard$/);

    // The used link is refused.
    await page.context().clearCookies();
    await page.goto(`/auth/confirm?token_hash=${tokenHash}&type=recovery`);
    await expect(page).toHaveURL(/\/forgot-password\?error=link$/);
    await expect(page.getByTestId("page-error")).toContainText("invalid or has expired");
  });

  test("/reset-password without a session sends the visitor to ask for a new link", async ({ page }) => {
    await page.goto("/reset-password");
    await expect(page).toHaveURL(/\/forgot-password\?error=expired$/);
    await expect(page.getByTestId("page-error")).toContainText("expired");
  });

  test("a sign-up link confirms the account and opens the dashboard", async ({ page }) => {
    const email = newTestAddress();
    const { data, error } = await serviceClient().auth.admin.generateLink({
      type: "signup",
      email,
      password: newTestPassword(),
    });
    expect(error).toBeNull();
    expect(data?.user?.id, "generateLink created the user").toBeTruthy();
    createdIds.push(data!.user!.id);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`/auth/confirm?token_hash=${data!.properties!.hashed_token}&type=signup`);
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByTestId("owner-email")).toHaveText(email);
  });
});

test.describe("password reset hardening (review findings 2 and 3)", () => {
  test("an ordinary login session cannot open or use /reset-password", async ({ page }) => {
    const user = await newUser();
    await page.goto("/login");
    await logIn(page, user);
    await expect(page).toHaveURL(/\/dashboard$/);
    await page.goto("/reset-password");
    // Refused (sent to /forgot-password), and a logged-in owner is then moved on
    // to the dashboard. The reset form is never shown.
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole("heading", { name: "Choose a new password" })).toHaveCount(0);
  });

  test("resetting the password ends the account's other sessions", async ({ browser }) => {
    const user = await newUser();
    const other = await browser.newContext({ baseURL: "http://localhost:3100" });
    const resetter = await browser.newContext({ baseURL: "http://localhost:3100" });
    try {
      const otherPage = await other.newPage();
      await otherPage.goto("/login");
      await logIn(otherPage, user);
      await expect(otherPage).toHaveURL(/\/dashboard$/);

      const { data, error } = await serviceClient().auth.admin.generateLink({
        type: "recovery",
        email: user.email,
      });
      expect(error).toBeNull();
      const resetPage = await resetter.newPage();
      await resetPage.goto(`/auth/confirm?token_hash=${data!.properties!.hashed_token}&type=recovery`);
      await expect(resetPage).toHaveURL(/\/reset-password$/);
      const fresh = newTestPassword();
      await resetPage.getByLabel("New password", { exact: true }).fill(fresh);
      await resetPage.getByLabel("Confirm new password").fill(fresh);
      await resetPage.getByRole("button", { name: "Save password" }).click();
      await expect(resetPage).toHaveURL(/\/login\?notice=password-updated$/);

      // The first browser's session is no longer accepted.
      await otherPage.goto("/dashboard");
      await expect(otherPage).toHaveURL(/\/login/);
      await expect(otherPage.getByTestId("owner-email")).toHaveCount(0);
    } finally {
      await other.close();
      await resetter.close();
    }
  });
});

test.describe("security headers (review finding 8)", () => {
  test("pages cannot be framed, but the embeddable widget can", async ({ request }) => {
    const login = await request.get("/login");
    expect(login.headers()["x-frame-options"]).toBe("DENY");
    expect(login.headers()["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(login.headers()["x-content-type-options"]).toBe("nosniff");
    expect(login.headers()["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    const embed = await request.get("/embed/sample-workspace");
    expect(embed.headers()["x-frame-options"]).toBeUndefined();
  });
});
