import { defineConfig } from '@playwright/test'
import { tmpdir } from 'node:os'
import path from 'node:path'

// Load local secrets into process.env with Node's built-in loader (no extra
// package). The values are never printed, logged or put in a snapshot.
process.loadEnvFile('.env.local')

// Database tests (DATABASE.md section 10). They call Supabase's web API; no
// browser is started, so no browser needs to be downloaded.
export default defineConfig({
  testDir: './tests/db',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  // Keep Playwright's scratch output out of the repository.
  outputDir: path.join(tmpdir(), 'slotmate-playwright-output'),
  // Safety net: removes any leftover test user, even after a crashed run.
  globalTeardown: './tests/db/global-teardown.ts',
})
