import { homedir } from "node:os";
import path from "node:path";

// Where the UI tests save screenshots: OUTSIDE the repository.
// Default: <home>/slotmate-notes/screenshots. Override with SLOTMATE_SCREENSHOT_DIR.
export const SCREENSHOT_DIR =
  process.env.SLOTMATE_SCREENSHOT_DIR ??
  path.join(homedir(), "slotmate-notes", "screenshots");
