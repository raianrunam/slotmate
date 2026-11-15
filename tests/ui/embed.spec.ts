import { expect, test, type Browser, type FrameLocator, type Page } from "@playwright/test";
import { serviceClient } from "../db/helpers";
import { addDaysToDate, todayInZone } from "../../src/lib/time/slots";
import { LOGGED_OUT } from "./owner";
import { addResource, addWorkspace, cleanupOwners, forgeOnSubmit, logIn, newOwner, setPlan, tag, type TestOwner } from "./owners";

// The embed widget (Phase 14: EMBED-01 to EMBED-07, D17, D18, D26, SEC frame rules).
// Real paths only: visitors are browsers with NO login (the widget runs inside an iframe of a
// "host" page that belongs to ANOTHER origin); owners are really logged in (RLS applies); the
// server key is used only to read back what the database holds.
//
// Every test makes its OWN owner or workspace, so tests never share an allowance (the booking
// rate limit is per visitor per workspace; every visitor gets its own made-up address).

test.use({ storageState: LOGGED_OUT });
test.afterAll(cleanupOwners);

const service = serviceClient();
const HOST = "http://embed-host.test"; // a different origin than the app; answered by page.route, no real server
const day = (n: number) => addDaysToDate(todayInZone("UTC"), n);
const rnd = () => 1 + Math.floor(Math.random() * 254);
const fakeAddress = () => `10.${rnd()}.${rnd()}.${rnd()}`;

interface Fixture {
  workspaceId: string;
  resourceId: string;
  slug: string;
  name: string;
  cleanup: () => Promise<void>;
}

/** A workspace with one resource open 24 hours on all weekdays, built as the owner (RLS). */
async function makeWorkspace(owner: TestOwner): Promise<Fixture> {
  const t = tag();
  const name = `Embed ${t}`;
  const slug = `em-${t}-${tag()}`;
  const workspaceId = await addWorkspace(owner, name, slug, "UTC");
  const resourceId = await addResource(owner, workspaceId, `Room ${t}`);
  const rows = [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ resource_id: resourceId, weekday, opens_at: "00:00", closes_at: "24:00" }));
  const av = await owner.client.from("resource_availability").insert(rows);
  if (av.error) throw new Error(`availability insert failed: ${av.error.message}`);
  return {
    workspaceId,
    resourceId,
    slug,
    name,
    cleanup: async () => {
      await owner.client.from("workspaces").delete().eq("id", workspaceId);
    },
  };
}

async function proOwner(): Promise<TestOwner> {
  const owner = await newOwner();
  await setPlan(owner.id, "pro");
  return owner;
}

/** A visitor's browser context with its own made-up address. The host page iframes the widget. */
async function visitor(browser: Browser, baseURL: string, width = 800) {
  const context = await browser.newContext({
    baseURL,
    viewport: { width, height: 900 },
    extraHTTPHeaders: { "x-forwarded-for": fakeAddress() },
  });
  const page = await context.newPage();
  return { context, page };
}

/** Answers the host's own address with a page that holds an iframe (a real cross-origin embed). */
async function openHost(page: Page, baseURL: string, src: string, title = "Book now") {
  await page.route(`${HOST}/**`, (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><html><head><meta charset="utf-8"><title>Host</title></head><body style="margin:0">
<iframe id="widget" title="${title}" src="${baseURL}${src}" width="100%" height="640" style="border:0"></iframe></body></html>`,
    }),
  );
  await page.goto(`${HOST}/`);
}

const widgetFrame = (page: Page): FrameLocator => page.frameLocator("#widget");

async function expectNotFound(page: Page) {
  await expect(page.getByRole("heading", { level: 1, name: "Page not found" })).toBeVisible();
}

async function setOptions(owner: TestOwner, workspaceId: string, changes: { theme?: "light" | "dark"; layout?: "list" | "grid"; background_color?: string | null }) {
  const result = await owner.client.from("embed_configurations").update(changes).eq("workspace_id", workspaceId).select("workspace_id");
  if (result.error || result.data?.length !== 1) throw new Error(`embed options update failed: ${result.error?.message ?? "no row"}`);
}

async function savedOptions(workspaceId: string) {
  const row = await service.from("embed_configurations").select("theme, layout, background_color").eq("workspace_id", workspaceId).single();
  if (row.error) throw new Error(row.error.message);
  return row.data;
}

// ---------------------------------------------------------------------------
// The widget inside another website
// ---------------------------------------------------------------------------
test.describe("the widget in an iframe on another origin", () => {
  test("a visitor books through the widget; the status link opens in a new tab; the booking exists", async ({ browser, baseURL }) => {
    const owner = await proOwner();
    const fx = await makeWorkspace(owner);
    const { context, page } = await visitor(browser, baseURL!);
    try {
      await openHost(page, baseURL!, `/embed/${fx.slug}`);
      const frame = widgetFrame(page);
      await expect(frame.getByTestId("embed-root")).toBeVisible();
      await expect(frame.getByRole("heading", { level: 1 })).toHaveText(fx.name);
      await expect(frame.getByTestId("zone-note")).toHaveText("Times are shown in UTC.");
      // Minimal chrome: no site header, no footer navigation.
      await expect(frame.getByRole("banner")).toHaveCount(0);
      await expect(frame.getByRole("contentinfo")).toHaveCount(0);

      // One resource is chosen automatically; pick a date and a time, fill in the details.
      await frame.getByLabel("Date", { exact: true }).fill(day(3));
      await frame.getByRole("button", { name: /^10:00 to / }).click();
      await frame.getByLabel("Name", { exact: true }).fill("Ada Lovelace");
      const email = `ada-${tag()}@example.com`;
      await frame.getByLabel("Email").fill(email);
      await frame.getByRole("button", { name: "Request booking" }).click();

      // The success panel stays inside the widget (the status page can never be framed).
      await expect(frame.getByTestId("embed-submitted")).toBeVisible();
      const link = frame.getByTestId("embed-status-link");
      await expect(link).toHaveAttribute("target", "_blank");
      await expect(link).toHaveAttribute("rel", /noopener/);
      await expect(link).toHaveAttribute("rel", /noreferrer/);

      const rows = await service.from("bookings").select("status, visitor_name, visitor_email").eq("resource_id", fx.resourceId);
      expect(rows.data).toEqual([{ status: "pending", visitor_name: "Ada Lovelace", visitor_email: email }]);

      const [popup] = await Promise.all([page.waitForEvent("popup"), link.click()]);
      await expect(popup).toHaveURL(/\/booking\/[A-Za-z0-9_-]{43}/);
      await expect(popup.getByText("Ada Lovelace")).toBeVisible();
    } finally {
      await context.close();
      await fx.cleanup();
    }
  });

  for (const width of [320, 480, 800]) {
    test(`fits a ${width}px wide iframe without sideways scrolling`, async ({ browser, baseURL }) => {
      const owner = await proOwner();
      const fx = await makeWorkspace(owner);
      const { context, page } = await visitor(browser, baseURL!, width + 40);
      try {
        await page.route(`${HOST}/**`, (route) =>
          route.fulfill({
            contentType: "text/html",
            body: `<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0"><iframe id="widget" title="w" src="${baseURL}/embed/${fx.slug}" width="${width}" height="700" style="border:0"></iframe></body></html>`,
          }),
        );
        await page.goto(`${HOST}/`);
        const frame = widgetFrame(page);
        await expect(frame.getByTestId("embed-root")).toBeVisible();
        const handle = await page.locator("#widget").elementHandle();
        const inner = await handle!.contentFrame();
        const overflow = await inner!.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        expect(overflow, "widget is wider than its frame by this many px").toBeLessThanOrEqual(0);
      } finally {
        await context.close();
        await fx.cleanup();
      }
    });
  }

  test("a missing slug and a malformed slug show the same not-found page as /book", async ({ page }) => {
    await page.goto(`/embed/no-such-workspace-${tag()}`);
    await expectNotFound(page);
    await page.goto("/embed/Not_A_Slug!");
    await expectNotFound(page);
    await page.goto(`/book/no-such-workspace-${tag()}`);
    await expectNotFound(page);
  });

  test("a locked workspace shows not found (after a downgrade with two workspaces)", async ({ page }) => {
    const owner = await proOwner();
    const a = await makeWorkspace(owner);
    const b = await makeWorkspace(owner);
    try {
      await page.goto(`/embed/${a.slug}`);
      await expect(page.getByTestId("embed-root")).toBeVisible();
      await setPlan(owner.id, "free"); // two workspaces on Free: both are locked until the owner chooses (A18)
      await page.goto(`/embed/${a.slug}`);
      await expectNotFound(page);
      await page.goto(`/embed/${b.slug}`);
      await expectNotFound(page);
    } finally {
      await a.cleanup();
      await b.cleanup();
    }
  });

  test("the page shows only what a visitor may see (no owner data, no other visitors' details)", async ({ browser, baseURL }) => {
    const owner = await proOwner();
    const fx = await makeWorkspace(owner);
    const secret = `private-${tag()}`;
    const booked = await service.rpc("submit_booking", {
      p_resource_id: fx.resourceId,
      p_starts_at: `${day(3)}T09:00:00.000Z`,
      p_visitor_name: secret,
      p_visitor_email: `${secret}@example.com`,
      p_visitor_phone: null as unknown as string,
      p_note: null as unknown as string,
      p_attendees: 1,
      p_status_token_hash: `\\x${tag()}${tag()}${tag()}${tag()}${tag()}${tag()}${tag()}${tag()}`,
    });
    expect(booked.error).toBeNull();
    const { context, page } = await visitor(browser, baseURL!);
    try {
      const response = await page.goto(`/embed/${fx.slug}`);
      const html = await response!.text();
      expect(html).not.toContain(secret);
      expect(html).not.toContain(owner.email);
      expect(html).not.toContain(owner.id);
    } finally {
      await context.close();
      await fx.cleanup();
    }
  });
});

// ---------------------------------------------------------------------------
// Frame rules
// ---------------------------------------------------------------------------
test.describe("frame headers", () => {
  test("/embed/<slug> is frameable by anyone; /login, /dashboard, /book and /booking are not", async ({ browser, baseURL, request }) => {
    const owner = await proOwner();
    const fx = await makeWorkspace(owner);
    try {
      const embed = await request.get(`/embed/${fx.slug}`);
      expect(embed.status()).toBe(200);
      expect(embed.headers()["content-security-policy"]).toBe("frame-ancestors *");
      expect(embed.headers()["x-frame-options"]).toBeUndefined();

      for (const path of ["/login", "/dashboard", `/book/${fx.slug}`, "/booking/" + "a".repeat(43), "/"]) {
        const res = await request.get(path);
        expect(res.headers()["x-frame-options"], path).toBe("DENY");
        expect(res.headers()["content-security-policy"], path).toBe("frame-ancestors 'none'");
      }

      // The browser really refuses to show the protected pages in a frame, and shows the widget.
      const { context, page } = await visitor(browser, baseURL!);
      try {
        await openHost(page, baseURL!, `/embed/${fx.slug}`);
        await expect(widgetFrame(page).getByTestId("embed-root")).toBeVisible();
        for (const path of ["/login", "/dashboard"]) {
          await openHost(page, baseURL!, path);
          await expect
            .poll(() => page.frames().some((f) => f.url().startsWith("chrome-error:")), { message: `${path} is blocked in a frame` })
            .toBe(true);
          await expect(widgetFrame(page).getByRole("heading", { name: /log in|sign in|dashboard/i })).toHaveCount(0);
        }
      } finally {
        await context.close();
      }
    } finally {
      await fx.cleanup();
    }
  });
});

// ---------------------------------------------------------------------------
// Options: saving, plan rules, applying
// ---------------------------------------------------------------------------
test.describe("the dashboard widget page", () => {
  test("a Pro owner saves theme, grid layout and a colour; the preview and the widget follow; the code holds only the address and size", async ({ page, context }) => {
    const owner = await proOwner();
    const fx = await makeWorkspace(owner);
    try {
      await logIn(page, owner);
      await context.grantPermissions(["clipboard-read", "clipboard-write"]);
      await page.goto(`/dashboard/widget?workspace=${fx.workspaceId}`);
      await expect(page.getByRole("heading", { level: 1, name: "Widget" })).toBeVisible();

      const code = page.getByTestId("embed-code");
      await expect(code).toContainText(`/embed/${fx.slug}`);
      const text = (await code.textContent()) ?? "";
      expect(text).not.toContain(fx.workspaceId);
      expect(text).not.toContain(owner.id);
      expect(text).not.toMatch(/key|token|secret/i);
      await page.getByRole("button", { name: "Copy code" }).click();
      await expect(page.getByText("Code copied")).toBeVisible();
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(text);

      await page.getByRole("radio", { name: "Dark" }).check();
      await page.getByRole("radio", { name: /^Grid/ }).check();
      await page.getByLabel("Background colour").fill("#112233");
      await page.getByRole("button", { name: "Save widget options" }).click();
      await expect(page.getByTestId("widget-saved")).toHaveText("Widget options saved.");
      expect(await savedOptions(fx.workspaceId)).toEqual({ theme: "dark", layout: "grid", background_color: "#112233" });

      const preview = page.frameLocator('[data-testid="widget-preview"]').getByTestId("embed-root");
      await expect(preview).toHaveAttribute("data-layout", "grid");
      await expect(preview).toHaveAttribute("data-theme", "dark");
      await expect(preview).toHaveCSS("background-color", "rgb(17, 34, 51)");

      // A colour that is not #rrggbb is refused next to the field, nothing changes.
      await page.getByLabel("Background colour").fill("red");
      await page.getByRole("button", { name: "Save widget options" }).click();
      await expect(page.getByTestId("widget-error")).toBeVisible();
      expect((await savedOptions(fx.workspaceId)).background_color).toBe("#112233");
    } finally {
      await fx.cleanup();
    }
  });

  test("a Free owner sees the Pro options disabled with an upgrade prompt; a forged Pro-only save is refused", async ({ page }) => {
    const owner = await newOwner(); // Free
    const fx = await makeWorkspace(owner);
    try {
      await logIn(page, owner);
      await page.goto("/dashboard/widget");
      await expect(page.getByTestId("widget-upgrade")).toBeVisible();
      await expect(page.getByRole("radio", { name: /^Grid/ })).toBeDisabled();
      await expect(page.getByLabel("Background colour")).toBeDisabled();
      await expect(page.getByRole("radio", { name: "Dark" })).toBeEnabled();

      // Theme works on Free.
      await page.getByRole("radio", { name: "Dark" }).check();
      await page.getByRole("button", { name: "Save widget options" }).click();
      await expect(page.getByTestId("widget-saved")).toBeVisible();
      expect((await savedOptions(fx.workspaceId)).theme).toBe("dark");

      // A tampered request that adds the Pro-only values is refused by the server and the database.
      await forgeOnSubmit(page, '[data-testid="widget-form"]', { layout: "grid", backgroundColor: "#ff0000" });
      await page.getByRole("radio", { name: "Light" }).check();
      await page.getByRole("button", { name: "Save widget options" }).click();
      await expect(page.getByTestId("widget-error")).toContainText("part of the Pro plan");
      expect(await savedOptions(fx.workspaceId)).toEqual({ theme: "dark", layout: "list", background_color: null });
    } finally {
      await fx.cleanup();
    }
  });

  test("a forged workspace id of another owner changes nothing", async ({ page }) => {
    const mine = await newOwner();
    const other = await proOwner();
    const mineFx = await makeWorkspace(mine);
    const otherFx = await makeWorkspace(other);
    try {
      await logIn(page, mine);
      await page.goto(`/dashboard/widget?workspace=${otherFx.workspaceId}`); // not mine: falls back to my own workspace
      await expect(page.getByTestId("embed-code")).toContainText(`/embed/${mineFx.slug}`);
      await expect(page.getByTestId("embed-code")).not.toContainText(otherFx.slug);

      await forgeOnSubmit(page, '[data-testid="widget-form"]', { workspaceId: otherFx.workspaceId });
      await page.getByRole("radio", { name: "Dark" }).check();
      await page.getByRole("button", { name: "Save widget options" }).click();
      await expect(page.getByTestId("widget-error")).toBeVisible();
      expect((await savedOptions(otherFx.workspaceId)).theme).toBe("light");
    } finally {
      await mineFx.cleanup();
      await otherFx.cleanup();
    }
  });

  test("with several workspaces the owner chooses one; the address keeps ?workspace=<id>", async ({ page }) => {
    const owner = await proOwner();
    const a = await makeWorkspace(owner);
    const b = await makeWorkspace(owner);
    try {
      await logIn(page, owner);
      await page.goto(`/dashboard/widget?workspace=${b.workspaceId}`);
      await expect(page.getByTestId("embed-code")).toContainText(`/embed/${b.slug}`);
      await page.getByRole("link", { name: a.name }).click();
      await expect(page).toHaveURL(new RegExp(`workspace=${a.workspaceId}`));
      await expect(page.getByTestId("embed-code")).toContainText(`/embed/${a.slug}`);
    } finally {
      await a.cleanup();
      await b.cleanup();
    }
  });

  test("a locked workspace is read-only", async ({ page }) => {
    const owner = await proOwner();
    const a = await makeWorkspace(owner);
    const b = await makeWorkspace(owner);
    try {
      await logIn(page, owner);
      await setPlan(owner.id, "free"); // both workspaces locked
      await page.goto(`/dashboard/widget?workspace=${a.workspaceId}`);
      await expect(page.getByTestId("widget-locked")).toBeVisible();
      await expect(page.getByRole("radio", { name: "Dark" })).toBeDisabled();
      await expect(page.getByRole("button", { name: "Save widget options" })).toHaveCount(0);
    } finally {
      await a.cleanup();
      await b.cleanup();
    }
  });
});

test.describe("applying the options on the widget (EMBED-05)", () => {
  test("Pro values are applied for a Pro owner and ignored after a downgrade; the theme stays", async ({ page }) => {
    const owner = await proOwner();
    const fx = await makeWorkspace(owner); // one workspace: a downgrade does not lock it
    try {
      await setOptions(owner, fx.workspaceId, { theme: "dark", layout: "grid", background_color: "#aabbcc" });

      await page.goto(`/embed/${fx.slug}`);
      const root = page.getByTestId("embed-root");
      await expect(root).toHaveAttribute("data-layout", "grid");
      await expect(root).toHaveAttribute("data-theme", "dark");
      await expect(root).toHaveCSS("background-color", "rgb(170, 187, 204)");

      await setPlan(owner.id, "free");
      // The stored values stay in the database (they return on an upgrade) ...
      expect(await savedOptions(fx.workspaceId)).toEqual({ theme: "dark", layout: "grid", background_color: "#aabbcc" });
      // ... but the widget ignores them.
      await page.goto(`/embed/${fx.slug}`);
      await expect(root).toHaveAttribute("data-layout", "list");
      await expect(root).toHaveAttribute("data-theme", "dark");
      await expect(root).not.toHaveCSS("background-color", "rgb(170, 187, 204)");
      await expect(root).not.toHaveAttribute("style", /background/);
    } finally {
      await fx.cleanup();
    }
  });
});
