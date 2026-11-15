import { expect, test, type Page } from "@playwright/test";
import { serviceClient } from "../db/helpers";
import { LOGGED_OUT } from "./owner";
import {
  addResource,
  addWorkspace,
  cleanupOwners,
  forgeOnSubmit,
  listOwnerFiles,
  listResourceFiles,
  logIn,
  newOwner,
  PNG_BYTES,
  PNG_BYTES_2,
  setPlan,
  tag,
  type TestOwner,
} from "./owners";

// Resource management checks (Phase 9: RES-01 to RES-08, D9, D13, D20, S1).
// Every test has its OWN throw-away owner, logged in through the real login form.
// Test data is made through real paths: the owner's own login (RLS) for owner
// data, service_role only for the plan change a webhook would make and to LOOK
// at Storage. Every owner's files in the bucket and every owner are deleted at
// the end.

test.use({ storageState: LOGGED_OUT });
test.afterAll(cleanupOwners);

const nameField = (page: Page) => page.getByLabel("Name", { exact: true });
const slotField = (page: Page) => page.getByLabel("Slot length (minutes)");
const capacityField = (page: Page) => page.getByLabel("Capacity (people per booking)");

async function storedResources(ownerId: string) {
  const { data, error } = await serviceClient()
    .from("resources")
    .select("id, name, description, slot_minutes, capacity, is_available, image_path, workspace_id")
    .eq("owner_id", ownerId)
    .order("created_at");
  if (error) throw new Error(error.message);
  return data;
}

const png = (bytes = PNG_BYTES, name = "photo.png") => ({ name, mimeType: "image/png", buffer: bytes });

// Puts an image in place for a resource the way the app does it (server key), for the victim tests.
async function giveImage(ownerId: string, resourceId: string): Promise<string> {
  const service = serviceClient();
  const path = `${resourceId}/${crypto.randomUUID()}.png`;
  expect((await service.storage.from("resource-images").upload(path, PNG_BYTES, { contentType: "image/png" })).error).toBeNull();
  expect((await service.rpc("set_resource_image", { p_owner_id: ownerId, p_resource_id: resourceId, p_path: path })).error).toBeNull();
  return path;
}

async function setup(page: Page, resources = 1) {
  const owner = await newOwner();
  const workspaceId = await addWorkspace(owner, "Studio");
  const ids: string[] = [];
  for (let i = 0; i < resources; i++) ids.push(await addResource(owner, workspaceId, `Room ${i + 1}`));
  await logIn(page, owner);
  return { owner, workspaceId, ids };
}

test.describe("create, edit and delete", () => {
  test("creates a resource in a chosen workspace and lists it with the usage", async ({ page }) => {
    const owner = await newOwner();
    const workspaceId = await addWorkspace(owner, "Studio");
    await logIn(page, owner);

    await page.goto("/dashboard/resources");
    await expect(page.getByTestId("resource-usage")).toContainText("0 of 3 resources");
    await expect(page.getByRole("heading", { name: "No resources yet" })).toBeVisible();

    await page.goto(`/dashboard/resources/new?workspace=${workspaceId}`);
    await expect(page.getByLabel("Workspace")).toHaveValue(workspaceId);
    await nameField(page).fill("Meeting room");
    await page.getByLabel("Description").fill("Seats eight.");
    await slotField(page).fill("45");
    await capacityField(page).fill("8");
    await page.getByRole("button", { name: "Create resource" }).click();

    await expect(page).toHaveURL(/\/dashboard\/resources\/[0-9a-f-]{36}\?notice=created$/);
    await expect(page.getByText("Resource created.")).toBeVisible();
    await page.goto("/dashboard/resources");
    const card = page.getByTestId("resource-card");
    await expect(card).toHaveCount(1);
    await expect(card).toContainText("Meeting room");
    await expect(card).toContainText("45 minutes per booking");
    await expect(card).toContainText("up to 8 people");
    await expect(card.getByRole("link", { name: "Studio" })).toBeVisible();
    await expect(page.getByTestId("resource-usage")).toContainText("1 of 3 resources");

    const [stored] = await storedResources(owner.id);
    expect(stored).toMatchObject({ name: "Meeting room", description: "Seats eight.", slot_minutes: 45, capacity: 8, is_available: true, image_path: null });
  });

  test("an empty name, a bad slot length and a bad capacity are refused; nothing is created", async ({ page }) => {
    const { owner } = await setup(page, 0);
    await page.goto("/dashboard/resources/new");

    await page.getByRole("button", { name: "Create resource" }).click();
    await expect(page.getByText("Enter a name for the resource.")).toBeVisible();

    await nameField(page).fill("Valid");
    for (const bad of ["0", "-5", "abc", "4", "1441", "12.5", ""]) {
      await slotField(page).fill(bad);
      await page.getByRole("button", { name: "Create resource" }).click();
      await expect(page.getByText("whole number of minutes, from 5 to 1440"), `slot "${bad}"`).toBeVisible();
    }
    await slotField(page).fill("30");
    for (const bad of ["0", "-1", "x", "1001", "2.5", ""]) {
      await capacityField(page).fill(bad);
      await page.getByRole("button", { name: "Create resource" }).click();
      await expect(page.getByText("capacity as a whole number, from 1 to 1000"), `capacity "${bad}"`).toBeVisible();
    }
    expect(await storedResources(owner.id)).toEqual([]);
  });

  test("edits a resource, including the availability switch (RES-06)", async ({ page }) => {
    const { owner, ids } = await setup(page);
    await page.goto(`/dashboard/resources/${ids[0]}`);
    await expect(nameField(page)).toHaveValue("Room 1");
    await nameField(page).fill("Renamed room");
    await slotField(page).fill("90");
    await capacityField(page).fill("12");
    await page.getByLabel("Available for booking").uncheck();
    await page.getByRole("button", { name: "Save changes" }).click();

    await expect(page).toHaveURL(/\/dashboard\/resources\?notice=saved$/);
    const card = page.getByTestId("resource-card");
    await expect(card).toContainText("Renamed room");
    await expect(card).toContainText("Unavailable");
    const [stored] = await storedResources(owner.id);
    expect(stored).toMatchObject({ name: "Renamed room", slot_minutes: 90, capacity: 12, is_available: false });
  });

  test("an empty name on edit is refused and nothing is saved", async ({ page }) => {
    const { owner, ids } = await setup(page);
    await page.goto(`/dashboard/resources/${ids[0]}`);
    await nameField(page).fill(" ");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Enter a name for the resource.")).toBeVisible();
    expect((await storedResources(owner.id))[0].name).toBe("Room 1");
  });

  test("delete asks for confirmation; Cancel and Escape keep it; confirming deletes it", async ({ page }) => {
    const { owner } = await setup(page);
    await page.goto("/dashboard/resources");
    const trigger = page.getByRole("button", { name: "Delete resource Room 1" });
    const dialog = page.getByRole("alertdialog");

    await trigger.click();
    await expect(dialog).toContainText("cannot be undone");
    await expect(dialog).toContainText(/booking requests/);
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(trigger).toBeFocused();
    expect(await storedResources(owner.id)).toHaveLength(1);
    await trigger.click();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    expect(await storedResources(owner.id)).toHaveLength(1);

    await trigger.click();
    await dialog.getByRole("button", { name: "Delete resource", exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard\/resources\?notice=deleted$/);
    await expect(page.getByText("Resource deleted.")).toBeVisible();
    expect(await storedResources(owner.id)).toEqual([]);
  });

  test("the workspace page lists its resources and links both ways", async ({ page }) => {
    const { workspaceId, ids } = await setup(page, 2);
    await page.goto(`/dashboard/workspaces/${workspaceId}`);
    const list = page.getByTestId("workspace-resource-list");
    await expect(list.getByRole("link")).toHaveCount(2);
    await list.getByRole("link", { name: "Room 2" }).click();
    await expect(page).toHaveURL(new RegExp(`/dashboard/resources/${ids[1]}$`));
    await page.getByRole("link", { name: "Studio" }).click();
    await expect(page).toHaveURL(new RegExp(`/dashboard/workspaces/${workspaceId}$`));
    await page.getByRole("link", { name: "Add resource" }).click();
    await expect(page).toHaveURL(new RegExp(`/dashboard/resources/new\\?workspace=${workspaceId}$`));
  });
});

test.describe("plan limit (Free: 3 resources across the account)", () => {
  test("the 4th resource is refused with an upgrade prompt; create is disabled at the limit", async ({ page }) => {
    const { ids } = await setup(page, 3);
    expect(ids).toHaveLength(3);
    await page.goto("/dashboard/resources");
    await expect(page.getByTestId("resource-usage")).toContainText("3 of 3 resources");
    await expect(page.getByRole("button", { name: "New resource" })).toBeDisabled();
    await expect(page.getByTestId("resource-limit-notice").getByRole("link", { name: "See Pro" })).toHaveAttribute("href", "/dashboard/billing");
    await page.goto("/dashboard/resources/new");
    await expect(page.getByTestId("resource-limit-notice")).toBeVisible();
    await expect(page.getByRole("button", { name: "Create resource" })).toHaveCount(0);
  });

  test("a create from a form opened earlier is refused with the upgrade prompt", async ({ page }) => {
    const { owner, workspaceId } = await setup(page, 2);
    await page.goto("/dashboard/resources/new");
    await nameField(page).fill("Fourth try");

    await addResource(owner, workspaceId, "Third, made elsewhere"); // now 3 of 3

    await page.getByRole("button", { name: "Create resource" }).click();
    await expect(page.getByTestId("resource-limit-notice")).toBeVisible();
    await expect(page).toHaveURL(/\/dashboard\/resources\/new$/);
    expect(await storedResources(owner.id)).toHaveLength(3);
  });

  test("the limit counts all workspaces together (D2)", async ({ page }) => {
    const owner = await newOwner();
    await setPlan(owner.id, "pro");
    const w1 = await addWorkspace(owner, "One");
    const w2 = await addWorkspace(owner, "Two");
    await addResource(owner, w1, "A");
    await addResource(owner, w1, "B");
    await addResource(owner, w2, "C");
    await setPlan(owner.id, "free"); // over the limit? 2 workspaces > 1: everything locks
    await logIn(page, owner);
    await page.goto("/dashboard/resources");
    await expect(page.getByTestId("resource-usage")).toContainText("3 of 3 resources");
  });
});

test.describe("image (RES-05, D9, S1)", () => {
  test("a PNG is uploaded, shown, replaced (the old file is deleted) and removed", async ({ page }) => {
    const { owner, ids } = await setup(page);
    await page.goto(`/dashboard/resources/${ids[0]}`);
    await expect(page.getByTestId("resource-image-placeholder")).toBeVisible();

    await page.getByLabel("Upload an image").setInputFiles(png());
    await page.getByRole("button", { name: "Upload image" }).click();
    await expect(page.getByTestId("image-message")).toHaveText("Image saved.");
    const image = page.getByTestId("resource-image");
    await expect(image).toBeVisible();

    const [stored] = await storedResources(owner.id);
    expect(stored.image_path).toMatch(new RegExp(`^${ids[0]}/[0-9a-f-]{36}\\.png$`));
    // The picture really loads from the public address and the file really exists.
    await expect.poll(() => image.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth)).toBe(1);
    const firstFiles = await listResourceFiles(ids[0]);
    expect(firstFiles).toEqual([stored.image_path]);

    // Replace: a different file; the old one is deleted, the path changes.
    await page.getByLabel("Replace the image").setInputFiles(png(PNG_BYTES_2, "other.png"));
    await page.getByRole("button", { name: "Replace image" }).click();
    await expect(page.getByTestId("image-message")).toHaveText("Image saved.");
    await expect.poll(async () => (await storedResources(owner.id))[0].image_path).not.toBe(stored.image_path);
    const [after] = await storedResources(owner.id);
    expect(await listResourceFiles(ids[0]), "only the new file remains").toEqual([after.image_path]);
    expect(await listResourceFiles(ids[0])).not.toContain(stored.image_path);

    // Remove.
    await page.getByRole("button", { name: "Remove image" }).click();
    await expect(page.getByTestId("image-message")).toHaveText("Image removed.");
    await expect(page.getByTestId("resource-image-placeholder")).toBeVisible();
    expect((await storedResources(owner.id))[0].image_path).toBeNull();
    expect(await listResourceFiles(ids[0]), "the file is gone").toEqual([]);
  });

  // NOTE: the browser form refuses a file over 2 MB BEFORE sending it (so nobody uploads
  // 50 MB for nothing), so this test proves the user-visible behaviour. The SERVER's own
  // 2 MB check (size, then real bytes) is proved by tests/unit/resources.spec.ts
  // (checkImageBytes at 2 MB and 2 MB + 1 byte, and the order of checks in the action).
  test("a file over 2 MB is refused (browser guard) and nothing is stored", async ({ page }) => {
    const { owner, ids } = await setup(page);
    await page.goto(`/dashboard/resources/${ids[0]}`);
    const big = Buffer.concat([PNG_BYTES, Buffer.alloc(2 * 1024 * 1024)]); // 2 MB + 70 bytes
    await page.getByLabel("Upload an image").setInputFiles(png(big, "big.png"));
    await page.getByRole("button", { name: "Upload image" }).click();
    await expect(page.getByTestId("image-message")).toContainText("larger than 2 MB");
    expect((await storedResources(owner.id))[0].image_path).toBeNull();
    expect(await listOwnerFiles(owner.id)).toEqual([]);
  });

  test("a text file renamed .png (fake image) is refused by the server", async ({ page }) => {
    const { owner, ids } = await setup(page);
    await page.goto(`/dashboard/resources/${ids[0]}`);
    await page.getByLabel("Upload an image").setInputFiles({
      name: "totally-a-photo.png",
      mimeType: "image/png", // the browser's claim is fake too
      buffer: Buffer.from("This is just some text, not a picture."),
    });
    await page.getByRole("button", { name: "Upload image" }).click();
    await expect(page.getByTestId("image-message")).toContainText("not a JPG, PNG or WebP image");
    expect((await storedResources(owner.id))[0].image_path).toBeNull();
    expect(await listOwnerFiles(owner.id)).toEqual([]);
  });

  test("an HTML or SVG file with an image name is refused", async ({ page }) => {
    const { owner, ids } = await setup(page);
    await page.goto(`/dashboard/resources/${ids[0]}`);
    for (const [name, text] of [
      ["x.png", "<html><script>alert(1)</script></html>"],
      ["y.png", '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'],
    ] as const) {
      await page.getByLabel("Upload an image").setInputFiles({ name, mimeType: "image/png", buffer: Buffer.from(text) });
      await page.getByRole("button", { name: "Upload image" }).click();
      await expect(page.getByTestId("image-message")).toContainText("not a JPG, PNG or WebP image");
    }
    expect(await listOwnerFiles(owner.id)).toEqual([]);
  });

  test("submitting with no file asks for one", async ({ page }) => {
    const { ids } = await setup(page);
    await page.goto(`/dashboard/resources/${ids[0]}`);
    await page.getByRole("button", { name: "Upload image" }).click();
    await expect(page.getByTestId("image-message")).toContainText("Choose an image file");
  });

  test("deleting a resource deletes its image file; deleting a workspace deletes all its resources' files", async ({ page }) => {
    const { owner, workspaceId, ids } = await setup(page, 2);
    for (const id of ids) {
      await page.goto(`/dashboard/resources/${id}`);
      await page.getByLabel("Upload an image").setInputFiles(png());
      await page.getByRole("button", { name: "Upload image" }).click();
      await expect(page.getByTestId("image-message")).toHaveText("Image saved.");
    }
    expect(await listOwnerFiles(owner.id), "two files stored").toHaveLength(2);

    // Resource delete: its file goes, the other stays.
    await page.goto(`/dashboard/resources/${ids[0]}`);
    await page.getByRole("button", { name: "Delete resource Room 1" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Delete resource", exact: true }).click();
    await expect(page).toHaveURL(/notice=deleted/);
    expect(await listResourceFiles(ids[0]), "deleted resource's file removed").toEqual([]);
    expect(await listResourceFiles(ids[1]), "the other file stays").toHaveLength(1);

    // Workspace delete: the remaining resource's file goes too (DB15).
    await page.goto(`/dashboard/workspaces/${workspaceId}`);
    await page.getByRole("button", { name: "Delete workspace Studio" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Delete workspace", exact: true }).click();
    await expect(page).toHaveURL(/workspaces\?notice=deleted/);
    expect(await listOwnerFiles(owner.id), "no files left after the workspace delete").toEqual([]);
    expect(await storedResources(owner.id)).toEqual([]);
  });
});

test.describe("locked resources (after a downgrade)", () => {
  test("are labelled, read-only, keep their image, refuse image changes, and can be deleted", async ({ page }) => {
    const owner = await newOwner();
    await setPlan(owner.id, "pro");
    const w1 = await addWorkspace(owner, "One");
    const w2 = await addWorkspace(owner, "Two");
    const r1 = await addResource(owner, w1, "Locked room");
    await addResource(owner, w2, "Other room");
    await logIn(page, owner);

    // An image while it is still editable.
    await page.goto(`/dashboard/resources/${r1}`);
    await page.getByLabel("Upload an image").setInputFiles(png());
    await page.getByRole("button", { name: "Upload image" }).click();
    await expect(page.getByTestId("image-message")).toHaveText("Image saved.");
    const before = (await storedResources(owner.id)).find((r) => r.id === r1)!.image_path;

    // Pro ends over the Free limits: everything locks (nothing is chosen for the owner).
    await setPlan(owner.id, "free");
    await page.goto("/dashboard/resources");
    const cards = page.getByTestId("resource-card");
    await expect(cards).toHaveCount(2);
    await expect(cards.getByText("Locked (plan limit)")).toHaveCount(2);

    await page.goto(`/dashboard/resources/${r1}`);
    const region = page.getByRole("region", { name: "Locked resource" });
    await expect(region.getByText("Locked (plan limit)")).toBeVisible();
    await expect(page.getByRole("button", { name: "Save changes" })).toHaveCount(0);
    await expect(nameField(page)).toHaveCount(0);
    await expect(page.getByRole("button", { name: /upload image|replace image|remove image/i })).toHaveCount(0);
    await expect(page.getByTestId("resource-image")).toBeVisible();
    expect((await storedResources(owner.id)).find((r) => r.id === r1)!.image_path).toBe(before);

    // Delete is still allowed, and removes the file.
    await page.getByRole("button", { name: "Delete resource Locked room" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Delete resource", exact: true }).click();
    await expect(page).toHaveURL(/notice=deleted/);
    expect(await listResourceFiles(r1)).toEqual([]);
  });

  test("an image upload for a resource that locked after the page opened is refused and stores nothing", async ({ page }) => {
    const owner = await newOwner();
    await setPlan(owner.id, "pro");
    const w1 = await addWorkspace(owner, "One");
    const w2 = await addWorkspace(owner, "Two");
    const r1 = await addResource(owner, w1, "Will lock");
    await addResource(owner, w2, "Other");
    await logIn(page, owner);
    await page.goto(`/dashboard/resources/${r1}`);
    await page.getByLabel("Upload an image").setInputFiles(png());

    await setPlan(owner.id, "free"); // locks while the form is open
    await page.getByRole("button", { name: "Upload image" }).click();
    await expect(page.getByTestId("image-message")).toContainText("locked");
    expect(await listOwnerFiles(owner.id), "no file was stored").toEqual([]);
    expect((await storedResources(owner.id)).find((r) => r.id === r1)!.image_path).toBeNull();
  });
});

test.describe("another owner's resource and forged fields (the server refuses)", () => {
  async function victim() {
    const other: TestOwner = await newOwner();
    const ws = await addWorkspace(other, "Victim ws");
    const id = await addResource(other, ws, "Victim room");
    return { other, ws, id };
  }

  test("update with a foreign id plus forged owner_id, workspace_id and is_locked changes nothing", async ({ page }) => {
    const { other, ws, id: foreignId } = await victim();
    const { owner, ids } = await setup(page);

    await page.goto(`/dashboard/resources/${ids[0]}`);
    await nameField(page).fill("Hacked name");
    await forgeOnSubmit(page, "form:has(input[name=id]):not(:has(input[name=image]))", {
      id: foreignId,
      owner_id: owner.id,
      workspace_id: ws,
      is_locked: "false",
      image_path: "x/y/z.png",
    });
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText(/cannot make this change/i)).toBeVisible();

    const theirs = (await storedResources(other.id))[0];
    expect(theirs).toMatchObject({ id: foreignId, name: "Victim room", workspace_id: ws, image_path: null });
    expect((await storedResources(owner.id))[0].name, "the owner's own resource is unchanged too").toBe("Room 1");
  });

  test("delete with a foreign id deletes nothing, not even the victim's image file", async ({ page }) => {
    const { other, id: foreignId } = await victim();
    const victimPath = await giveImage(other.id, foreignId);
    await setup(page);
    await page.goto("/dashboard/resources");
    await page.getByRole("button", { name: "Delete resource Room 1" }).click();
    await forgeOnSubmit(page, "form:has(input[name=id])", { id: foreignId });
    await page.getByRole("alertdialog").getByRole("button", { name: "Delete resource", exact: true }).click();
    await expect(page.getByText(/cannot make this change/i)).toBeVisible();
    expect(await storedResources(other.id), "the foreign resource still exists").toHaveLength(1);
    expect(await listOwnerFiles(other.id), "the victim's image file still exists").toEqual([victimPath]);
  });

  test("forged owner_id, workspace_id, is_locked and image_path on the owner's OWN resource are ignored", async ({ page }) => {
    const { other, ws: foreignWs } = await victim();
    const { owner, workspaceId, ids } = await setup(page);
    await page.goto(`/dashboard/resources/${ids[0]}`);
    await nameField(page).fill("Edited normally");
    await forgeOnSubmit(page, "form:has(input[name=id]):not(:has(input[name=image]))", {
      owner_id: other.id,
      workspace_id: foreignWs,
      is_locked: "true",
      image_path: "evil/evil/evil.png",
    });
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page).toHaveURL(/notice=saved/);
    const [mine] = await storedResources(owner.id);
    expect(mine).toMatchObject({ id: ids[0], name: "Edited normally", workspace_id: workspaceId, image_path: null });
    expect(await storedResources(other.id), "nothing moved to the other owner").toHaveLength(1);
    const lock = await serviceClient().from("resources").select("is_locked, owner_id").eq("id", ids[0]).single();
    expect(lock.data).toEqual({ is_locked: false, owner_id: owner.id });
  });

  test("image upload and image removal with a foreign id store and remove nothing", async ({ page }) => {
    const { other, id: foreignId } = await victim();
    // The victim has an image, put in place the way the app does it (server key).
    const service = serviceClient();
    const victimPath = `${foreignId}/${tag()}-${tag()}-${tag()}.png`.replace(/[^0-9a-f/.-]/g, "0");
    expect((await service.storage.from("resource-images").upload(victimPath, PNG_BYTES, { contentType: "image/png" })).error).toBeNull();
    const rec = await service.rpc("set_resource_image", { p_owner_id: other.id, p_resource_id: foreignId, p_path: victimPath });
    expect(rec.error).toBeNull();

    const { owner, ids } = await setup(page);
    await page.goto(`/dashboard/resources/${ids[0]}`);
    // Upload with a tampered id.
    await page.getByLabel("Upload an image").setInputFiles(png());
    await forgeOnSubmit(page, "form:has(input[name=image])", { id: foreignId });
    await page.getByRole("button", { name: "Upload image" }).click();
    await expect(page.getByTestId("image-message")).toContainText("cannot make this change");
    expect(await listOwnerFiles(owner.id), "nothing stored for the attacker").toEqual([]);

    // Give the attacker an image of their own so a Remove button exists, then tamper that form.
    await page.reload();
    await page.getByLabel("Upload an image").setInputFiles(png());
    await page.getByRole("button", { name: "Upload image" }).click();
    await expect(page.getByTestId("image-message")).toHaveText("Image saved.");
    await forgeOnSubmit(page, "form:has(input[name=intent])", { id: foreignId });
    await page.getByRole("button", { name: "Remove image" }).click();
    await expect(page.getByTestId("image-message")).toContainText("cannot make this change");

    // The victim's image is untouched: still recorded, file still there.
    expect((await storedResources(other.id))[0].image_path).toBe(victimPath);
    expect(await listOwnerFiles(other.id)).toEqual([victimPath]);
    expect((await storedResources(owner.id))[0].image_path, "the attacker's own image is untouched too").not.toBeNull();
  });

  test("another owner's resource page is not found", async ({ page }) => {
    const { id: foreignId } = await victim();
    await setup(page, 0);
    await page.goto(`/dashboard/resources/${foreignId}`);
    await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
    await expect(page.locator("body")).not.toContainText("Victim room");
  });
});

test("logged-out visitors cannot open the resource pages", async ({ page }) => {
  for (const path of ["/dashboard/resources", "/dashboard/resources/new", "/dashboard/resources/00000000-0000-4000-8000-000000000000"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login\?next=/);
  }
});

test.describe("image upload edge cases (Phase 9 review carry-overs)", () => {
  // Simulates a tampered browser: the form's own size guard sees a small file, but
  // the request that is really sent carries a big one (FormData is replaced at send time).
  async function sendBigFileInstead(page: Page, size: number) {
    await page.evaluate((size) => {
      const Original = window.FormData;
      window.FormData = class extends Original {
        constructor(form?: HTMLFormElement, submitter?: HTMLElement | null) {
          super(form, submitter);
          if (form && form.querySelector("input[name=image]")) {
            const bytes = new Uint8Array(size);
            bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d, 0x49, 0x48, 0x44, 0x52]);
            this.set("image", new File([bytes], "big.png", { type: "image/png" }));
          }
        }
      } as typeof FormData;
    }, size);
  }

  test("a ~2.15 MB file that skips the browser check reaches the server and gets the friendly 'too large' message", async ({ page }) => {
    const { owner, ids } = await setup(page);
    await page.goto(`/dashboard/resources/${ids[0]}`);
    await page.getByLabel("Upload an image").setInputFiles(png()); // small: the browser guard passes
    await sendBigFileInstead(page, 2_150_000); // over 2 MB, under the 2200 kB request limit
    await page.getByRole("button", { name: "Upload image" }).click();
    await expect(page.getByTestId("image-message")).toContainText("larger than 2 MB");
    expect((await storedResources(owner.id))[0].image_path).toBeNull();
    expect(await listOwnerFiles(owner.id), "the bucket is empty").toEqual([]);
  });

  test("a ~3.5 MB request is stopped before the action: nothing stored and the page shows a friendly message", async ({ page }) => {
    const { owner, ids } = await setup(page);
    await page.goto(`/dashboard/resources/${ids[0]}`);
    await page.getByLabel("Upload an image").setInputFiles(png());
    await sendBigFileInstead(page, 3_500_000);
    await page.getByRole("button", { name: "Upload image" }).click();
    await expect(page.getByTestId("image-message")).toContainText("could not be completed");
    await expect(page.getByRole("heading", { level: 1, name: "Room 1" }), "no error page").toBeVisible();
    expect(await listOwnerFiles(owner.id), "nothing stored").toEqual([]);
    expect((await storedResources(owner.id))[0].image_path).toBeNull();
    // The page still works after the failure: a normal upload succeeds.
    await page.reload();
    await page.getByLabel("Upload an image").setInputFiles(png());
    await page.getByRole("button", { name: "Upload image" }).click();
    await expect(page.getByTestId("image-message")).toHaveText("Image saved.");
  });

  for (const [mime, ext] of [["image/jpeg", "jpg"], ["image/webp", "webp"]] as const) {
    test(`a real ${ext.toUpperCase()} made by the browser is accepted, stored with the right type and shown`, async ({ page }) => {
      const { owner, ids } = await setup(page);
      await page.goto(`/dashboard/resources/${ids[0]}`);
      const bytes = await page.evaluate(async (type) => {
        const canvas = document.createElement("canvas");
        canvas.width = 16;
        canvas.height = 16;
        const ctx = canvas.getContext("2d")!;
        ctx.fillStyle = "#3366cc";
        ctx.fillRect(0, 0, 16, 16);
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type));
        return Array.from(new Uint8Array(await blob!.arrayBuffer()));
      }, mime);
      expect(bytes.length, `the browser made a ${ext}`).toBeGreaterThan(20);

      await page.getByLabel("Upload an image").setInputFiles({ name: `photo.${ext}`, mimeType: mime, buffer: Buffer.from(bytes) });
      await page.getByRole("button", { name: "Upload image" }).click();
      await expect(page.getByTestId("image-message")).toHaveText("Image saved.");
      const [stored] = await storedResources(owner.id);
      expect(stored.image_path).toMatch(new RegExp(`\.${ext}$`));
      const url = await page.getByTestId("resource-image").getAttribute("src");
      const res = await fetch(url!);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain(mime);
    });
  }

  // A file that is only seconds old might belong to an upload still in progress (uploaded, path not
  // recorded yet), so the sweep leaves it alone (Phase 10 review finding 2: two simultaneous uploads must
  // not delete each other's file). Old strays are swept; the delete of the resource takes everything.
  test("a young stray file survives an upload (race safety); the previous image is deleted at once; the delete takes all", async ({ page }) => {
    const { owner, ids } = await setup(page);
    const stray = `${ids[0]}/${crypto.randomUUID()}.png`;
    expect((await serviceClient().storage.from("resource-images").upload(stray, PNG_BYTES, { contentType: "image/png" })).error).toBeNull();
    await page.goto(`/dashboard/resources/${ids[0]}`);
    await page.getByLabel("Upload an image").setInputFiles(png());
    await page.getByRole("button", { name: "Upload image" }).click();
    await expect(page.getByTestId("image-message")).toHaveText("Image saved.");
    const [first] = await storedResources(owner.id);
    expect((await listResourceFiles(ids[0])).sort(), "the young stray is still there").toEqual([first.image_path, stray].sort());

    // A replace deletes the previous recorded image straight away (even though it is young)...
    await page.getByLabel("Replace the image").setInputFiles(png(PNG_BYTES_2, "second.png"));
    await page.getByRole("button", { name: "Replace image" }).click();
    await expect(page.getByTestId("image-message")).toHaveText("Image saved.");
    await expect.poll(async () => (await storedResources(owner.id))[0].image_path).not.toBe(first.image_path);
    const [second] = await storedResources(owner.id);
    await expect.poll(async () => (await listResourceFiles(ids[0])).sort()).toEqual([second.image_path, stray].sort());

    // ...and deleting the resource removes everything, strays included.
    await page.getByRole("button", { name: "Delete resource Room 1" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Delete resource", exact: true }).click();
    await expect(page).toHaveURL(/notice=deleted/);
    expect(await listResourceFiles(ids[0])).toEqual([]);
  });
});
