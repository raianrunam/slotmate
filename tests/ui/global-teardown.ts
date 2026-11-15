import { existsSync, readFileSync, rmSync } from "node:fs";
import { assertNoLeftovers, clearLedger, removeOrphanBucketFiles, sweepTestUsers } from "../db/helpers";
import { deleteTestUser, OWNER_INFO, OWNER_STATE } from "./owner";

// Deletes the shared owner, then sweeps any other "slotmate-test-" user a
// crashed test may have left behind. Nothing may remain in the project.
export default async function globalTeardown() {
  if (existsSync(OWNER_INFO)) {
    const { id } = JSON.parse(readFileSync(OWNER_INFO, "utf8")) as { id: string };
    await deleteTestUser(id);
  }
  rmSync(OWNER_INFO, { force: true });
  rmSync(OWNER_STATE, { force: true });
  await sweepTestUsers();
  await removeOrphanBucketFiles();
  // Permanent check: fails the run if any test user or test file remains.
  await assertNoLeftovers();
  clearLedger();
}
