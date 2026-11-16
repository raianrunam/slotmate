import { expect, test, type Page } from "@playwright/test";
import { createHash, randomBytes } from "node:crypto";
import { serviceClient } from "../db/helpers";
import { LOGGED_OUT } from "./owner";
import { addResource, cleanupOwners, logIn, newOwner, setPlan, tag } from "./owners";

// SEC-02: text typed by users is shown as plain text and never runs as code. Script and HTML are put into the
// workspace name and description, the resource name and description, and the visitor's name and note, then every
// page that shows them is opened: the public page, the status page, the embed, and the dashboard list and details.
// Pass = the text appears LITERALLY on the page, no script ran, and no element was created from it.

test.use({ storageState: LOGGED_OUT });
test.afterAll(cleanupOwners);

const service = serviceClient();

// Each value is a different attack: an image with an event handler, a script tag, a bold tag with an id.
const WORKSPACE_NAME = '<img src=x onerror=window.__xss=1><b id="xss-ws">W</b>';
const WORKSPACE_DESC = '<script>window.__xss=1</script><b id="xss-wsd">D</b>';
const RESOURCE_NAME = '<img src=x onerror=window.__xss=1><b id="xss-rn">R</b>';
const RESOURCE_DESC = '<script>window.__xss=1</script><b id="xss-rd">RD</b>';
const VISITOR_NAME = '<img src=x onerror=window.__xss=1><b id="xss-vn">V</b>';
const VISITOR_NOTE = '<script>window.__xss=1</script><b id="xss-vnote">N</b>';

async function watch(page: Page) {
  const dialogs: string[] = [];
  page.on("dialog", async (d) => {
    dialogs.push(d.message());
    await d.dismiss();
  });
  return dialogs;
}

/** The page shows each text literally, ran no script, and made no element out of the text. */
async function expectInert(page: Page, dialogs: string[], shown: string[], label: string) {
  for (const text of shown) {
    await expect(page.locator("body"), `${label}: ${text} is shown as text`).toContainText(text);
  }
  expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss), `${label}: no script ran`).toBeUndefined();
  expect(dialogs, `${label}: no dialog`).toEqual([]);
  for (const id of ["xss-ws", "xss-wsd", "xss-rn", "xss-rd", "xss-vn", "xss-vnote"]) {
    await expect(page.locator(`#${id}`), `${label}: #${id} was not created from text`).toHaveCount(0);
  }
  await expect(page.locator('img[src="x"]'), `${label}: no image made from text`).toHaveCount(0);
  await expect(page.locator("script", { hasText: "__xss" }), `${label}: no script made from text`).toHaveCount(0);
}

test("script and HTML in names, descriptions and notes show as plain text everywhere (SEC-02)", async ({ page }) => {
  const owner = await newOwner();
  await setPlan(owner.id, "pro");
  const slug = `xs-${tag()}`;
  const ws = await owner.client
    .from("workspaces")
    .insert({ owner_id: owner.id, name: WORKSPACE_NAME, description: WORKSPACE_DESC, slug, time_zone: "UTC" })
    .select("id")
    .single();
  expect(ws.error).toBeNull();
  const workspaceId = ws.data!.id;
  const resourceId = await addResource(owner, workspaceId, RESOURCE_NAME);
  const upd = await owner.client
    .from("resources")
    .update({ description: RESOURCE_DESC, slot_minutes: 60, capacity: 4 })
    .eq("id", resourceId)
    .select("id");
  expect(upd.error).toBeNull();
  const av = await owner.client
    .from("resource_availability")
    .insert([1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ resource_id: resourceId, weekday, opens_at: "00:00", closes_at: "24:00" })));
  expect(av.error).toBeNull();

  // The visitor's request (the server key calls submit_booking, as the public page does) with a known status code.
  const code = randomBytes(32).toString("base64url");
  const when = new Date(Date.now() + 3 * 86_400_000);
  when.setUTCMinutes(0, 0, 0);
  const booked = await service.rpc("submit_booking", {
    p_resource_id: resourceId,
    p_starts_at: when.toISOString(),
    p_visitor_name: VISITOR_NAME,
    p_visitor_email: `v-${tag()}@example.com`,
    p_visitor_phone: null as unknown as string,
    p_note: VISITOR_NOTE,
    p_attendees: 1,
    p_status_token_hash: `\\x${createHash("sha256").update(code).digest("hex")}`,
  });
  expect(booked.error).toBeNull();
  const bookingId = booked.data![0].booking_id;

  const dialogs = await watch(page);

  // Visitor pages (no login).
  await page.goto(`/book/${slug}`);
  await expectInert(page, dialogs, [WORKSPACE_NAME, RESOURCE_NAME], "public page");
  await page.goto(`/embed/${slug}`);
  await expectInert(page, dialogs, [RESOURCE_NAME], "embed");
  await page.goto(`/booking/${code}`);
  await expectInert(page, dialogs, [RESOURCE_NAME], "status page");

  // Owner pages.
  await logIn(page, owner);
  await page.goto("/dashboard");
  await expectInert(page, dialogs, [VISITOR_NAME, RESOURCE_NAME], "dashboard overview");
  await page.goto("/dashboard/workspaces");
  await expectInert(page, dialogs, [WORKSPACE_NAME, WORKSPACE_DESC], "workspace list");
  await page.goto("/dashboard/resources");
  await expectInert(page, dialogs, [RESOURCE_NAME], "resource list");
  await page.goto("/dashboard/bookings");
  await expectInert(page, dialogs, [VISITOR_NAME, RESOURCE_NAME], "booking list");
  await page.goto(`/dashboard/bookings/${bookingId}`);
  await expectInert(page, dialogs, [VISITOR_NAME, VISITOR_NOTE, RESOURCE_NAME, WORKSPACE_NAME], "booking details");
  await page.goto("/dashboard/analytics");
  await expectInert(page, dialogs, [WORKSPACE_NAME], "analytics");
});
