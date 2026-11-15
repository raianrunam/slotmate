import { randomBytes } from "node:crypto";
import type { Page } from "@playwright/test";
import { anonClient, serviceClient, type Db } from "../db/helpers";
import { createTestUser, deleteTestUser, type TestUser } from "./owner";

// Helpers for UI tests that need their OWN logged-in owner (the shared owner of
// the other UI tests would collide when tests run in parallel). Owners are made
// through the Auth admin API (no email) and deleted afterwards. Because deleting
// an owner does NOT delete their Storage files, cleanup also removes every file
// under <owner_id>/ in the resource-images bucket.

export interface TestOwner extends TestUser {
  /** The owner's own logged-in API client (role authenticated, RLS applies). */
  client: Db;
}

export const tag = () => randomBytes(4).toString("hex");

const createdIds: string[] = [];

export async function newOwner(): Promise<TestOwner> {
  const user = await createTestUser({ confirmed: true });
  createdIds.push(user.id);
  const client = anonClient();
  const signIn = await client.auth.signInWithPassword({ email: user.email, password: user.password });
  if (signIn.error) throw new Error(`owner sign-in failed: ${signIn.error.message}`);
  return { ...user, client };
}

// Logs the browser in as this owner. The owner already signed in once through the
// API (newOwner), so the SAME real session is placed in the browser as the login
// cookie the app itself would set (name and format of @supabase/ssr). This keeps
// the number of password sign-ins low (Supabase rate-limits them); the real login
// FORM is tested in tests/ui/auth.spec.ts.
export async function logIn(page: Page, owner: TestOwner) {
  const { data } = await owner.client.auth.getSession();
  if (!data.session) throw new Error("test owner has no session");
  const ref = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname.split(".")[0];
  const value = "base64-" + Buffer.from(JSON.stringify(data.session)).toString("base64url");
  const CHUNK = 3180;
  const name = `sb-${ref}-auth-token`;
  const parts = value.length <= CHUNK ? [[name, value]] : Array.from({ length: Math.ceil(value.length / CHUNK) }, (_, i) => [`${name}.${i}`, value.slice(i * CHUNK, (i + 1) * CHUNK)]);
  await page.context().addCookies(parts.map(([n, v]) => ({ name: n, value: v, domain: "localhost", path: "/", sameSite: "Lax" as const })));
  await page.goto("/dashboard");
  await page.waitForURL("**/dashboard");
}

const BUCKET = "resource-images";

/** All file paths under <ownerId>/ in the bucket (service_role read, test code only). */
export async function listOwnerFiles(ownerId: string): Promise<string[]> {
  const storage = serviceClient().storage.from(BUCKET);
  const folders = await storage.list(ownerId, { limit: 100 });
  const paths: string[] = [];
  for (const folder of folders.data ?? []) {
    const files = await storage.list(`${ownerId}/${folder.name}`, { limit: 100 });
    for (const file of files.data ?? []) paths.push(`${ownerId}/${folder.name}/${file.name}`);
  }
  return paths;
}

/** Files of ONE resource's folder. */
export async function listResourceFiles(ownerId: string, resourceId: string): Promise<string[]> {
  const files = await serviceClient().storage.from(BUCKET).list(`${ownerId}/${resourceId}`, { limit: 100 });
  return (files.data ?? []).map((f) => `${ownerId}/${resourceId}/${f.name}`);
}

/** Call from afterAll: removes the files, then the owners. */
export async function cleanupOwners(): Promise<void> {
  const storage = serviceClient().storage.from(BUCKET);
  for (const id of createdIds) {
    const files = await listOwnerFiles(id);
    if (files.length > 0) await storage.remove(files);
  }
  for (const id of createdIds) await deleteTestUser(id);
  createdIds.length = 0;
}

export async function addWorkspace(owner: TestOwner, name: string, slug = `ws-${tag()}`, timeZone = "UTC") {
  const { data, error } = await owner.client
    .from("workspaces")
    .insert({ owner_id: owner.id, name, slug, time_zone: timeZone })
    .select("id")
    .single();
  if (error) throw new Error(`test workspace insert failed: ${error.message}`);
  return data.id;
}

export async function addResource(owner: TestOwner, workspaceId: string, name: string) {
  const { data, error } = await owner.client
    .from("resources")
    .insert({ owner_id: owner.id, workspace_id: workspaceId, name, slot_minutes: 30, capacity: 2 })
    .select("id")
    .single();
  if (error) throw new Error(`test resource insert failed: ${error.message}`);
  return data.id;
}

/** Make the owner Pro and back to Free, the way a Stripe webhook does (service_role). */
export async function setPlan(ownerId: string, plan: "pro" | "free") {
  const changes =
    plan === "pro"
      ? { plan: "pro" as const, status: "active", stripe_subscription_id: `sub_test_${tag()}${tag()}` }
      : { plan: "free" as const, status: "canceled", stripe_subscription_id: null };
  const { error } = await serviceClient().from("subscriptions").update(changes).eq("owner_id", ownerId);
  if (error) throw new Error(`plan change failed: ${error.message}`);
}

// A real 1x1 PNG, a text file, and helpers to build upload payloads.
export const PNG_BYTES = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
/** A different valid PNG file (same picture, extra trailing byte) so a replace really changes the file. */
export const PNG_BYTES_2 = Buffer.concat([PNG_BYTES, Buffer.from([0])]);
