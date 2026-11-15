import { homedir } from "node:os";
import path from "node:path";

// Where the UI tests save screenshots: OUTSIDE the repository.
// Default: <home>/slotmate-notes/screenshots. Override with SLOTMATE_SCREENSHOT_DIR.
export const SCREENSHOT_DIR =
  process.env.SLOTMATE_SCREENSHOT_DIR ??
  path.join(homedir(), "slotmate-notes", "screenshots");

/**
 * Waits until React has attached to an element (hydration finished). Before that, a click or key press on
 * server-rendered HTML does nothing (a menu stays closed) or falls back to a plain form post. React marks every
 * element it hydrates with a "__reactProps$..." property, so this is a real signal, not a fixed sleep.
 */
export async function waitForHydration(locator: import("@playwright/test").Locator): Promise<void> {
  await locator.waitFor({ state: "visible" });
  await locator.evaluate(
    (el) =>
      new Promise<void>((resolve, reject) => {
        const started = Date.now();
        const check = () => {
          if (Object.keys(el).some((k) => k.startsWith("__reactProps$"))) resolve();
          else if (Date.now() - started > 15_000) reject(new Error("the element was never hydrated"));
          else setTimeout(check, 25);
        };
        check();
      }),
  );
}
