// Shared helpers for the SlotMate Claude Code hooks (plain Node, no packages).
// A hook receives one JSON object on stdin and answers with JSON on stdout.
// PreToolUse answers with hookSpecificOutput.permissionDecision = allow | deny | ask.

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function readStdin() {
  return new Promise((resolve) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => (data += chunk));
    process.stdin.on("end", () => resolve(data));
    // If nothing is piped in (a person ran the script by hand), do not wait forever.
    if (process.stdin.isTTY) resolve("");
  });
}

export function parseInput(text) {
  try {
    const value = JSON.parse(text);
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
}

// Build the JSON that a PreToolUse hook prints. "allow" prints nothing and lets the normal
// permission rules decide, so a hook can never loosen a rule by accident.
export function preToolUseAnswer(decision, reason) {
  if (decision === "allow") return null;
  return {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: decision,
      permissionDecisionReason: reason,
    },
  };
}

export function printAnswer(answer) {
  if (answer) process.stdout.write(JSON.stringify(answer) + "\n");
}

// The project folder: Claude Code sets CLAUDE_PROJECT_DIR; fall back to the hook's own location.
export function projectDir(input) {
  if (process.env.CLAUDE_PROJECT_DIR) return path.resolve(process.env.CLAUDE_PROJECT_DIR);
  if (input && typeof input.cwd === "string" && input.cwd) return path.resolve(input.cwd);
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
}

export function isTrackedByGit(projectRoot, absoluteFile) {
  const result = spawnSync("git", ["ls-files", "--error-unmatch", "--", absoluteFile], {
    cwd: projectRoot,
    encoding: "utf8",
    windowsHide: true,
  });
  return result.status === 0;
}

export function isMain(metaUrl) {
  return Boolean(process.argv[1]) && path.resolve(process.argv[1]) === fileURLToPath(metaUrl);
}
