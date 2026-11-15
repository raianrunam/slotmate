import { defineConfig } from "@playwright/test";
import { tmpdir } from "node:os";
import path from "node:path";

// User-interface checks (Phases 6 and 7). They open the pages in a real browser
// (Chromium) at the three tested widths.
//
// Phase 7: the app needs its Supabase settings and the tests create throw-away
// owners (slotmate-test-...@example.com) through the Auth admin API, which
// sends no email. Local settings are loaded with Node's built-in loader; the
// values are never printed. The database tests have their own config
// (playwright.config.ts).
process.loadEnvFile(".env.local");

const PORT = 3100;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./tests/ui",
  fullyParallel: true,
  workers: 4,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"]],
  // Keep Playwright's scratch output out of the repository.
  outputDir: path.join(tmpdir(), "slotmate-playwright-ui-output"),
  // Creates one logged-in test owner for the dashboard checks; removes it at the end.
  globalSetup: "./tests/ui/global-setup.ts",
  globalTeardown: "./tests/ui/global-teardown.ts",
  use: {
    baseURL: BASE_URL,
    browserName: "chromium",
  },
  // Test the production build, as visitors will see it.
  webServer: {
    command: `npm run build && npm run start -- --port ${PORT}`,
    url: BASE_URL,
    timeout: 300_000,
    // Never silently test an old server that happens to be on this port.
    reuseExistingServer: false,
  },
});
