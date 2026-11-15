import { defineConfig } from "@playwright/test";
import { tmpdir } from "node:os";
import path from "node:path";

// Unit tests (Phase 7): plain functions and source-code checks. No browser, no
// server, no database, no secrets. Playwright's runner is used so no extra
// test package is needed.
export default defineConfig({
  testDir: "./tests/unit",
  fullyParallel: true,
  retries: 0,
  timeout: 30_000,
  reporter: [["list"]],
  outputDir: path.join(tmpdir(), "slotmate-playwright-unit-output"),
});
