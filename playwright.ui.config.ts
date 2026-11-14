import { defineConfig } from "@playwright/test";
import { tmpdir } from "node:os";
import path from "node:path";

// User-interface checks (Phase 6). They open the pages in a real browser
// (Chromium) at the three tested widths and need no database and no secrets.
// The database tests have their own config (playwright.config.ts).
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
