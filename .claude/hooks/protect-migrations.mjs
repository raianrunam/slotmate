// PreToolUse hook for Edit, Write and MultiEdit.
// Rule (CLAUDE.md "Database rules"): a migration that is already tracked by Git has been pushed,
// so it is never edited. A fix is a NEW migration file. New (untracked) files are allowed.

import path from "node:path";
import { isMain, isTrackedByGit, parseInput, preToolUseAnswer, printAnswer, projectDir, readStdin } from "./lib.mjs";

export const MESSAGE = "pushed migrations are never edited; create a new one";

export function decide(input, isTracked = isTrackedByGit) {
  const tool = input.tool_name;
  if (tool !== "Edit" && tool !== "Write" && tool !== "MultiEdit") return preToolUseAnswer("allow");
  const filePath = input.tool_input && input.tool_input.file_path;
  if (typeof filePath !== "string" || !filePath) return preToolUseAnswer("allow");

  const root = projectDir(input);
  const absolute = path.resolve(root, filePath);
  const relative = path.relative(root, absolute).split(path.sep).join("/");
  if (!relative.startsWith("supabase/migrations/")) return preToolUseAnswer("allow");

  if (isTracked(root, absolute)) {
    return preToolUseAnswer("deny", `${MESSAGE} (${relative} is tracked by git).`);
  }
  return preToolUseAnswer("allow");
}

if (isMain(import.meta.url)) {
  const input = parseInput(await readStdin());
  printAnswer(decide(input));
}
