import { assertNoLeftovers, clearLedger, removeOrphanBucketFiles, sweepTestUsers } from './helpers'

// Runs once after all database tests. Each spec file already deletes its own
// test users in afterAll; this removes any user left behind by a crash.
export default async function globalTeardown(): Promise<void> {
  const leftover = await sweepTestUsers()
  if (leftover > 0) {
    console.warn(`global teardown: removed ${leftover} leftover test user(s)`)
  }
  const orphans = await removeOrphanBucketFiles()
  if (orphans > 0) console.warn(`global teardown: removed ${orphans} leftover test file(s) from the image bucket`)
  // Permanent check: fails the run if any test user or test file remains.
  await assertNoLeftovers()
  clearLedger()
}
