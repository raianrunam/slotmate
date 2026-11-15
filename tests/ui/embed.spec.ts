import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
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
// The host page is served by a small REAL local server on another port (so it is another origin than the app).
// A page answered through page.route would look like a "public" address to Chromium's local-network check, which
// then refuses to frame a localhost address (net::ERR_BLOCKED_BY_LOCAL_NETWORK_ACCESS_CHECKS).
let hostServer: Server | null = null;
let hostOrigin = "";
async function startHost(): Promise<string> {
  if (hostServer) return hostOrigin;
  hostServer = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://host.local");
    const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
    const src = esc(url.searchParams.get("src") ?? "");
    const title = esc(url.searchParams.get("title") ?? "Book now");
    const width = esc(url.searchParams.get("w") ?? "100%");
    const height = esc(url.searchParams.get("h") ?? "640");
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.end(`<!doctype html><html><head><meta charset="utf-8"><title>Host</title></head><body style="margin:0"><iframe id="widget" title="${title}" src="${src}" width="${width}" height="${height}" style="border:0"></iframe></body></html>`);
  });
  await new Promise<void>((resolve) => hostServer!.listen(0, "127.0.0.1", resolve));
  hostOrigin = `http://127.0.0.1:${(hostServer.address() as AddressInfo).port}`;
  return hostOrigin;
}
test.afterAll(async () => {
  await new Promise<void>((resolve) => (hostServer ? hostServer.close(() => resolve()) : resolve()));
  hostServer = null;
});
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

/** Opens a host page (another origin) that holds an iframe of the given address (a real cross-origin embed). */
async function openHost(page: Page, baseURL: string, src: string, title = "Book now", width = "100%", height = "640") {
  const origin = await startHost();
  const query = new URLSearchParams({ src: `${baseURL}${src}`, title, w: width, h: height });
  await page.goto(`${origin}/?${query}`);
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

      // Read as the owner: the server key may not read the visitor columns (Q3).
      const rows = await owner.client.from("bookings").select("status, visitor_name, visitor_email").eq("resource_id", fx.resourceId);
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
        await openHost(page, baseURL!, `/embed/${fx.slug}`, "w", String(width), "700");
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

      // Real requests to a real server (redirects are NOT followed, so /dashboard is checked itself and not the /login it redirects to).
      // Phase 14 review: bare /embed, /embedx, a longer status address, an API route, a static file, a Server Action POST,
      // and an encoded spelling of /booking.
      const strict = [
        "/login",
        "/dashboard",
        "/dashboard/widget",
        `/book/${fx.slug}`,
        "/booking/" + "a".repeat(43),
        "/booking/" + "a".repeat(43) + "/extra",
        "/embedx",
        "/embedded/x",
        "/api/nothing",
        "/_next/static/nothing.js",
        "/embed-theme-dark.js",
        "/",
        "/%62ooking/" + "a".repeat(43),
      ];
      for (const path of strict) {
        const res = await request.get(path, { maxRedirects: 0 });
        expect(res.headers()["x-frame-options"], path).toBe("DENY");
        expect(res.headers()["content-security-policy"], path).toBe("frame-ancestors 'none'");
      }
      // Bare /embed is the widget rule only (one rule, not two).
      const bare = await request.get("/embed", { maxRedirects: 0 });
      expect(bare.headers()["content-security-policy"]).toBe("frame-ancestors *");
      expect(bare.headers()["x-frame-options"]).toBeUndefined();
      // A Server Action style POST to the widget page keeps the widget rule; a POST to the login page stays strict.
      const post = await request.post(`/embed/${fx.slug}`, { data: "x", maxRedirects: 0 });
      expect(post.headers()["content-security-policy"]).toBe("frame-ancestors *");
      const postLogin = await request.post("/login", { data: "x", maxRedirects: 0 });
      expect(postLogin.headers()["content-security-policy"]).toBe("frame-ancestors 'none'");
      // The status page keeps its strict cache and referrer rules on every spelling of its address, including a longer one.
      for (const path of ["/booking/" + "a".repeat(43), "/booking/" + "a".repeat(43) + "/extra"]) {
        const res = await request.get(path, { maxRedirects: 0 });
        // (a longer address is a not-found page, and Next.js writes its own, equally strict, cache header for that)
        expect(res.headers()["cache-control"], path).toContain("no-store");
        expect(res.headers()["referrer-policy"], path).toBe("no-referrer");
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
      const copied = await page.evaluate(() => navigator.clipboard.readText());
      expect(copied.replace(/\s+/g, " ").trim()).toBe(text.replace(/\s+/g, " ").trim()); // the same code (only the line breaks and spaces may differ)

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
      // (What a person with the browser's developer tools does: enable the disabled fields and fill them in.)
      await page.evaluate(() => {
        const group = document.querySelector<HTMLFieldSetElement>('[data-testid="widget-layout-group"]')!;
        group.disabled = false;
        const grid = group.querySelector<HTMLInputElement>('input[name="layout"][value="grid"]')!;
        grid.disabled = false;
        grid.checked = true;
        const colour = document.querySelector<HTMLInputElement>('input[name="backgroundColor"]')!;
        colour.disabled = false;
        colour.value = "#ff0000";
      });
      await page.getByRole("radio", { name: "Light" }).check();
      await page.getByRole("button", { name: "Save widget options" }).click();
      await expect(page.getByTestId("widget-error")).toContainText("part of the Pro plan");
      expect(await savedOptions(fx.workspaceId)).toEqual({ theme: "dark", layout: "list", background_color: null });
    } finally {
      await fx.cleanup();
    }
  });

  test("a custom background colour reaches the whole booking form: every text keeps a readable contrast (EMBED-04)", async ({ page }) => {
    // Phase 14 review (high): the colour used to be set on the outer wrapper only, so the form's own cards and panels kept
    // the theme's colours and the text on them became unreadable (navy on the light theme, white on the dark theme).
    const owner = await proOwner();
    for (const [theme, colour] of [["light", "#0a1f44"], ["dark", "#f5f0e6"], ["light", "#ff9800"]] as const) {
      const fx = await makeWorkspace(owner);
      try {
        await setOptions(owner, fx.workspaceId, { theme, layout: "list", background_color: colour });
        await page.goto(`/embed/${fx.slug}`);
        await expect(page.getByTestId("embed-root")).toBeVisible();
        await page.getByRole("button", { name: /Room/ }).first().click().catch(() => undefined); // open the form where a resource must be chosen
        await page.getByLabel("Date", { exact: true }).fill(day(2));
        const worst = await page.evaluate(() => {
          const canvas = document.createElement("canvas");
          canvas.width = canvas.height = 1;
          const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
          const rgba = (css: string): [number, number, number, number] => {
            ctx.clearRect(0, 0, 1, 1);
            ctx.fillStyle = "#000";
            ctx.fillStyle = css;
            ctx.fillRect(0, 0, 1, 1);
            const d = ctx.getImageData(0, 0, 1, 1).data;
            return [d[0], d[1], d[2], d[3] / 255];
          };
          const lum = ([r, g, b]: number[]) => {
            const f = (v: number) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
            return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
          };
          const backgroundOf = (el: Element): [number, number, number] => {
            let node: Element | null = el;
            while (node) {
              const c = rgba(getComputedStyle(node).backgroundColor);
              if (c[3] > 0.99) return [c[0], c[1], c[2]];
              node = node.parentElement;
            }
            return [255, 255, 255];
          };
          const out: { text: string; ratio: number }[] = [];
          const root = document.querySelector('[data-testid="embed-root"]')!;
          const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
          for (let n = walker.nextNode(); n; n = walker.nextNode()) {
            const text = (n.textContent ?? "").trim();
            const el = n.parentElement;
            if (!text || !el) continue;
            const style = getComputedStyle(el);
            if (style.visibility === "hidden" || style.display === "none" || el.closest("[hidden]")) continue;
            const fg = rgba(style.color);
            const bg = backgroundOf(el);
            const a = lum([fg[0], fg[1], fg[2]]);
            const b = lum(bg);
            out.push({ text: text.slice(0, 40), ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) });
          }
          out.sort((x, y) => x.ratio - y.ratio);
          return { count: out.length, worst: out.slice(0, 3) };
        });
        expect(worst.count, "the widget has text").toBeGreaterThan(5);
        for (const item of worst.worst) expect(item.ratio, `${theme} ${colour}: "${item.text}"`).toBeGreaterThanOrEqual(4.5);
      } finally {
        await fx.cleanup();
      }
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
