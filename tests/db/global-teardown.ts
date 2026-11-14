import { sweepTestUsers } from './helpers'

// Runs once after all database tests. Each spec file already deletes its own
// test users in afterAll; this removes any user left behind by a crash.
export default async function globalTeardown(): Promise<void> {
  const leftover = await sweepTestUsers()
  if (leftover > 0) {
    console.warn(`global teardown: removed ${leftover} leftover test user(s)`)
  }
}
