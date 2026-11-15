import { randomBytes, randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import { recordTestUserId, serviceClient } from "../db/helpers";

// Throw-away owners for the UI tests. They are created through the Auth admin
// API (no email is sent: A20) and their addresses start with "slotmate-test-"
// so the sweep in global-teardown can always find them.

/** The saved browser session of the shared logged-in owner (made in global-setup). */
export const OWNER_STATE = path.join(tmpdir(), "slotmate-ui-owner-state.json");
/** The shared owner's details (id, email, password), for the teardown. */
export const OWNER_INFO = path.join(tmpdir(), "slotmate-ui-owner-info.json");
/** Use in test.use() to run a test with nobody logged in. */
export const LOGGED_OUT = { cookies: [], origins: [] };

export interface TestUser {
  id: string;
  email: string;
  password: string;
}

export function newTestAddress(): string {
  return `slotmate-test-${randomUUID()}@example.com`;
}

export function newTestPassword(): string {
  return `Aa1-${randomBytes(18).toString("base64url")}`;
}

export async function createTestUser(options: { confirmed?: boolean } = {}): Promise<TestUser> {
  const email = newTestAddress();
  const password = newTestPassword();
  const { data, error } = await serviceClient().auth.admin.createUser({
    email,
    password,
    email_confirm: options.confirmed ?? true,
  });
  if (error || !data.user) {
    throw new Error(`auth.admin.createUser failed: ${error?.message ?? "no user returned"}`);
  }
  recordTestUserId(data.user.id);
  return { id: data.user.id, email, password };
}

export async function deleteTestUser(id: string): Promise<void> {
  const { error } = await serviceClient().auth.admin.deleteUser(id);
  if (error && !/not found/i.test(error.message)) {
    throw new Error(`auth.admin.deleteUser failed: ${error.message}`);
  }
}

/** Is there an Auth user with this address? (admin lookup, test addresses only) */
export async function userExists(email: string): Promise<boolean> {
  const { data, error } = await serviceClient().auth.admin.listUsers({ page: 1, perPage: 200 });
  if (error) throw new Error(`auth.admin.listUsers failed: ${error.message}`);
  return data.users.some((u) => u.email === email);
}
