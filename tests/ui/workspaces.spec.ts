import { randomBytes } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { anonClient, serviceClient, type Db } from "../db/helpers";
import { createTestUser, deleteTestUser, LOGGED_OUT, type TestUser } from "./owner";

// Workspace management checks (Phase 8: WORK-01 to WORK-04, D12, D13, D20).
// Every test uses its OWN throw-away owner, logged in through the real login
// form (the shared owner of the other UI tests would collide when tests run in
// parallel). Test data is made through real paths: the owner's own login (RLS)
// for owner data, service_role only for the plan change a webhook would make.
// Everything is deleted afterwards (deleting the Auth user cascades).

test.use({ storageState: LOGGED_OUT, timezoneId: "Europe/London" });

const createdIds: string[] = [];
test.afterAll(async () => {
  for (const id of createdIds) await deleteTestUser(id);
});

interface TestOwner extends TestUser {
  /** The owner's own logged-in API client (role authenticated, RLS applies). */
  client: Db;
}

async function newOwner(): Promise<TestOwner> {
  const user = await createTestUser({ confirmed: true });
  createdIds.push(user.id);
  const client = anonClient();
  const signIn = await client.auth.signInWithPassword({ email: user.email, password: user.password });
  if (signIn.error) throw new Error(`owner sign-in failed: ${signIn.error.message}`);
  return { ...user, client };
}

async function logIn(page: Page, owner: TestUser) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(owner.email);
  await page.getByLabel("Password").fill(owner.password);
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL("**/dashboard");
}

const tag = () => randomBytes(4).toString("hex");

async function addWorkspace(owner: TestOwner, name: string, slug: string, timeZone = "UTC") {
  const { data, error } = await owner.client
    .from("workspaces")
    .insert({ owner_id: owner.id, name, slug, time_zone: timeZone })
    .select("id")
    .single();
  if (error) throw new Error(`test workspace insert failed: ${error.message}`);
  return data.id;
}

async function storedWorkspaces(ownerId: string) {
  const { data, error } = await serviceClient()
    .from("workspaces")
    .select("id, name, slug, time_zone, description")
    .eq("owner_id", ownerId);
  if (error) throw new Error(error.message);
  return data;
}

const nameField = (page: Page) => page.getByLabel("Name", { exact: true });
const slugField = (page: Page) => page.getByLabel("Public address");
const zoneField = (page: Page) => page.getByLabel("Time zone");

test.describe("create a workspace", () => {
  test("suggests the address and browser time zone, creates it, and lists it", async ({ page }) => {
    const owner = await newOwner();
    await logIn(page, owner);

    await page.goto("/dashboard/workspaces");
    await expect(page.getByTestId("workspace-usage")).toContainText("0 of 1 workspaces");
    await expect(page.getByRole("heading", { name: "No workspaces yet" })).toBeVisible();

    await page.goto("/dashboard/workspaces/new");
    await nameField(page).fill("Acme Studio");
    await expect(slugField(page)).toHaveValue("acme-studio");
    await expect(page.getByTestId("slug-hint")).toContainText("/book/acme-studio");
    await expect(zoneField(page), "the browser's zone is suggested").toHaveValue("Europe/London");
    await page.getByLabel("Description").fill("Our main studio.");
    await page.getByRole("button", { name: "Create workspace" }).click();

    await expect(page).toHaveURL(/\/dashboard\/workspaces\?notice=created$/);
    await expect(page.getByText("Workspace created.")).toBeVisible();
    const card = page.getByTestId("workspace-card");
    await expect(card).toHaveCount(1);
    await expect(card).toContainText("Acme Studio");
    await expect(card).toContainText("/book/acme-studio");
    await expect(card).toContainText("Europe/London time");
    await expect(page.getByTestId("workspace-usage")).toContainText("1 of 1 workspaces");

    const [stored] = await storedWorkspaces(owner.id);
    expect(stored).toMatchObject({ name: "Acme Studio", slug: "acme-studio", time_zone: "Europe/London", description: "Our main studio." });
  });

  test("an empty name creates nothing", async ({ page }) => {
    const owner = await newOwner();
    await logIn(page, owner);
    await page.goto("/dashboard/workspaces/new");
    await slugField(page).fill("some-address");
    await page.getByRole("button", { name: "Create workspace" }).click();
    await expect(page.getByText("Enter a name for the workspace.")).toBeVisible();
    expect(await storedWorkspaces(owner.id)).toEqual([]);
  });

  test("an invalid address shows a live hint and is refused by the server", async ({ page }) => {
    const owner = await newOwner();
    await logIn(page, owner);
    await page.goto("/dashboard/workspaces/new");
    await nameField(page).fill("Valid name");

    await slugField(page).fill("Bad Slug!");
    await expect(page.getByTestId("slug-hint"), "live format hint").toContainText("lowercase");
    await page.getByRole("button", { name: "Create workspace" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "3 to 40 characters" })).toBeVisible();
    expect(await storedWorkspaces(owner.id)).toEqual([]);

    await slugField(page).fill("ab");
    await expect(page.getByTestId("slug-hint")).toContainText("Too short");
    await slugField(page).fill("good-address");
    await expect(page.getByTestId("slug-hint")).toContainText("/book/good-address");
  });

  test("a missing or unknown time zone is refused", async ({ page }) => {
    const owner = await newOwner();
    await logIn(page, owner);
    await page.goto("/dashboard/workspaces/new");
    await nameField(page).fill("Zone test");

    await zoneField(page).fill("");
    await page.getByRole("button", { name: "Create workspace" }).click();
    await expect(page.getByText("Choose a time zone from the list.")).toBeVisible();

    await zoneField(page).fill("Mars/Olympus");
    await page.getByRole("button", { name: "Create workspace" }).click();
    await expect(page.getByText("That is not a time zone we know. Choose one from the list.")).toBeVisible();
    expect(await storedWorkspaces(owner.id)).toEqual([]);
  });

  test("an address used by ANOTHER owner is refused with \"That address is taken\"", async ({ page }) => {
    const other = await newOwner();
    const taken = `taken-${tag()}`;
    await addWorkspace(other, "Other owner workspace", taken);

    const owner = await newOwner();
    await logIn(page, owner);
    await page.goto("/dashboard/workspaces/new");
    await nameField(page).fill("My workspace");
    await slugField(page).fill(taken);
    await page.getByRole("button", { name: "Create workspace" }).click();

    await expect(page.getByText("That address is taken")).toBeVisible();
    await expect(page).toHaveURL(/\/dashboard\/workspaces\/new$/);
    expect(await storedWorkspaces(owner.id), "nothing created").toEqual([]);
    // The message does not leak database text.
    await expect(page.locator("body")).not.toContainText(/duplicate key|constraint|violates/i);
  });
});

test.describe("plan limit (Free: 1 workspace)", () => {
  test("at the limit: usage shown, create disabled, upgrade prompt, no form", async ({ page }) => {
    const owner = await newOwner();
    await addWorkspace(owner, "First", `first-${tag()}`);
    await logIn(page, owner);

    await page.goto("/dashboard/workspaces");
    await expect(page.getByTestId("workspace-usage")).toContainText("1 of 1 workspaces");
    await expect(page.getByRole("button", { name: "New workspace" })).toBeDisabled();
    await expect(page.getByTestId("workspace-limit-notice")).toContainText("reached your workspace limit");
    await expect(page.getByTestId("workspace-limit-notice").getByRole("link", { name: "See Pro" })).toHaveAttribute("href", "/dashboard/billing");

    await page.goto("/dashboard/workspaces/new");
    await expect(page.getByTestId("workspace-limit-notice")).toBeVisible();
    await expect(page.getByRole("button", { name: "Create workspace" })).toHaveCount(0);
  });

  test("a second create is refused with the upgrade prompt, even from a form opened earlier", async ({ page }) => {
    const owner = await newOwner();
    await logIn(page, owner);
    await page.goto("/dashboard/workspaces/new");
    await nameField(page).fill("Second try");
    await expect(slugField(page)).toHaveValue("second-try");

    // Meanwhile (another tab) the owner creates their one allowed workspace.
    await addWorkspace(owner, "Created elsewhere", `elsewhere-${tag()}`);

    await page.getByRole("button", { name: "Create workspace" }).click();
    await expect(page.getByTestId("workspace-limit-notice")).toBeVisible();
    await expect(page).toHaveURL(/\/dashboard\/workspaces\/new$/);
    const stored = await storedWorkspaces(owner.id);
    expect(stored.map((w) => w.name), "only the first workspace exists").toEqual(["Created elsewhere"]);
  });
});

test.describe("edit a workspace", () => {
  test("changes the name, description and address, and shows them in the list", async ({ page }) => {
    const owner = await newOwner();
    const id = await addWorkspace(owner, "Old name", `old-${tag()}`, "Europe/London");
    await logIn(page, owner);

    await page.goto(`/dashboard/workspaces/${id}`);
    await expect(nameField(page)).toHaveValue("Old name");
    await nameField(page).fill("New name");
    // Editing the name must NOT rewrite an existing address.
    await expect(slugField(page)).toHaveValue(/^old-/);
    const newSlug = `new-${tag()}`;
    await slugField(page).fill(newSlug);
    await page.getByLabel("Description").fill("Now with a description.");
    await page.getByRole("button", { name: "Save changes" }).click();

    await expect(page).toHaveURL(/\/dashboard\/workspaces\?notice=saved$/);
    const card = page.getByTestId("workspace-card");
    await expect(card).toContainText("New name");
    await expect(card).toContainText(`/book/${newSlug}`);
    await expect(card).toContainText("Now with a description.");
    const [stored] = await storedWorkspaces(owner.id);
    expect(stored).toMatchObject({ name: "New name", slug: newSlug, description: "Now with a description." });
  });

  test("an empty name is refused and nothing is saved", async ({ page }) => {
    const owner = await newOwner();
    const id = await addWorkspace(owner, "Keep me", `keep-${tag()}`);
    await logIn(page, owner);
    await page.goto(`/dashboard/workspaces/${id}`);
    await nameField(page).fill("  ");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Enter a name for the workspace.")).toBeVisible();
    expect((await storedWorkspaces(owner.id))[0].name).toBe("Keep me");
  });

  test("changing the time zone shows the warning; changing it back hides it; it saves", async ({ page }) => {
    const owner = await newOwner();
    const id = await addWorkspace(owner, "Zone ws", `zone-${tag()}`, "Europe/London");
    await logIn(page, owner);
    await page.goto(`/dashboard/workspaces/${id}`);

    const warning = page.getByTestId("time-zone-warning");
    await expect(zoneField(page)).toHaveValue("Europe/London");
    await expect(warning, "no warning before a change").toHaveCount(0);

    await zoneField(page).fill("Asia/Tokyo");
    await expect(warning).toBeVisible();
    await expect(warning).toContainText("exact moment");
    await expect(warning).toContainText("shift");

    await zoneField(page).fill("Europe/London");
    await expect(warning).toHaveCount(0);

    await zoneField(page).fill("Asia/Tokyo");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page).toHaveURL(/notice=saved/);
    expect((await storedWorkspaces(owner.id))[0].time_zone).toBe("Asia/Tokyo");
  });

  test("another owner's workspace is not found (the server refuses)", async ({ page }) => {
    const other = await newOwner();
    const foreignId = await addWorkspace(other, "Not yours", `foreign-${tag()}`);
    const owner = await newOwner();
    await logIn(page, owner);
    await page.goto(`/dashboard/workspaces/${foreignId}`);
    await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
    await expect(page.locator("body")).not.toContainText("Not yours");
  });
});

test.describe("delete a workspace", () => {
  test("asks for confirmation; Cancel and Escape keep it; confirming deletes it for good", async ({ page }) => {
    const owner = await newOwner();
    const slug = `del-${tag()}`;
    await addWorkspace(owner, "Doomed", slug);
    await logIn(page, owner);
    await page.goto("/dashboard/workspaces");

    const trigger = page.getByRole("button", { name: "Delete workspace Doomed" });
    const dialog = page.getByRole("alertdialog");

    await trigger.click();
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("cannot be undone");
    await expect(dialog).toContainText(/resources/);
    await expect(dialog).toContainText(/booking requests/);
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
    expect(await storedWorkspaces(owner.id), "Cancel deletes nothing").toHaveLength(1);

    await trigger.click();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    expect(await storedWorkspaces(owner.id), "Escape deletes nothing").toHaveLength(1);

    await trigger.click();
    await dialog.getByRole("button", { name: "Delete workspace", exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard\/workspaces\?notice=deleted$/);
    await expect(page.getByText("Workspace deleted.")).toBeVisible();
    await expect(page.getByRole("heading", { name: "No workspaces yet" })).toBeVisible();
    expect(await storedWorkspaces(owner.id)).toEqual([]);
  });
});

test.describe("locked workspaces (after a downgrade)", () => {
  test("are visible, labelled, read-only, and can still be deleted", async ({ page }) => {
    const owner = await newOwner();
    const service = serviceClient();
    // Pro and back, the way the Stripe webhook changes the plan (service_role).
    await service
      .from("subscriptions")
      .update({ plan: "pro", status: "active", stripe_subscription_id: `sub_test_${tag()}${tag()}` })
      .eq("owner_id", owner.id);
    const first = await addWorkspace(owner, "Locked one", `lock-a-${tag()}`);
    await addWorkspace(owner, "Locked two", `lock-b-${tag()}`);
    const downgrade = await service
      .from("subscriptions")
      .update({ plan: "free", status: "canceled", stripe_subscription_id: null })
      .eq("owner_id", owner.id);
    expect(downgrade.error).toBeNull();

    await logIn(page, owner);
    await page.goto("/dashboard/workspaces");
    const cards = page.getByTestId("workspace-card");
    await expect(cards).toHaveCount(2);
    await expect(cards.getByText("Locked (plan limit)")).toHaveCount(2);
    await expect(page.getByText("read-only and hidden from visitors", { exact: false }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "New workspace" })).toBeDisabled();
    await expect(page.getByTestId("workspace-usage")).toContainText("2 of 1 workspaces");

    // The detail page is read-only: no form, no save button, but delete is there.
    await page.goto(`/dashboard/workspaces/${first}`);
    await expect(page.getByRole("region", { name: "Locked workspace" }).getByText("Locked (plan limit)")).toBeVisible();
    await expect(page.getByRole("button", { name: "Save changes" })).toHaveCount(0);
    await expect(page.getByLabel("Name", { exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Delete workspace Locked one" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Delete workspace", exact: true }).click();
    await expect(page).toHaveURL(/notice=deleted/);

    // Deleting one brought the owner back within the limit: the other is unlocked.
    await expect(cards).toHaveCount(1);
    // (Scoped to the cards: Next keeps the previous page hidden in the DOM.)
    await expect(cards.getByText("Locked (plan limit)")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Edit workspace Locked two" })).toBeVisible();
  });

  test("a direct save on a locked workspace is refused by the server", async ({ page }) => {
    const owner = await newOwner();
    const service = serviceClient();
    await service
      .from("subscriptions")
      .update({ plan: "pro", status: "active", stripe_subscription_id: `sub_test_${tag()}${tag()}` })
      .eq("owner_id", owner.id);
    const id = await addWorkspace(owner, "Will lock", `wl-a-${tag()}`);
    await addWorkspace(owner, "Will lock too", `wl-b-${tag()}`);

    await logIn(page, owner);
    // Open the edit form while it is still editable...
    await page.goto(`/dashboard/workspaces/${id}`);
    await nameField(page).fill("Sneaky rename");
    // ...then the plan ends before the owner presses Save.
    await service
      .from("subscriptions")
      .update({ plan: "free", status: "canceled", stripe_subscription_id: null })
      .eq("owner_id", owner.id);
    await page.getByRole("button", { name: "Save changes" }).click();

    await expect(page.getByText(/cannot make this change/i)).toBeVisible();
    const names = (await storedWorkspaces(owner.id)).map((w) => w.name).sort();
    expect(names).toEqual(["Will lock", "Will lock too"]);
  });
});

test.describe("dashboard overview", () => {
  test("shows the real workspace count and a link to the list", async ({ page }) => {
    const owner = await newOwner();
    await addWorkspace(owner, "Counted", `counted-${tag()}`);
    await logIn(page, owner);
    await page.goto("/dashboard");
    await expect(page.getByTestId("overview-workspaces-count")).toHaveText("1");
    await page.getByRole("link", { name: "Manage workspaces" }).click();
    await expect(page).toHaveURL(/\/dashboard\/workspaces$/);
  });
});

test("logged-out visitors cannot open the workspace pages", async ({ page }) => {
  for (const path of ["/dashboard/workspaces", "/dashboard/workspaces/new", "/dashboard/workspaces/00000000-0000-4000-8000-000000000000"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login\?next=/);
  }
});
