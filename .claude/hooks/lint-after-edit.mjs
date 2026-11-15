// PostToolUse hook for Edit, Write and MultiEdit on .ts and .tsx files.
// Runs ESLint on the one file that changed and tells Claude about problems.
// It never blocks: the edit already happened, and the answer is only extra context for the agent.

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { isMain, parseInput, projectDir, readStdin } from "./lib.mjs";

export function targetFile(input) {
  const tool = input.tool_name;
  if (tool !== "Edit" && tool !== "Write" && tool !== "MultiEdit") return null;
  const filePath = input.tool_input && input.tool_input.file_path;
  if (typeof filePath !== "string" || !/\.(ts|tsx)$/i.test(filePath)) return null;
  const root = projectDir(input);
  const absolute = path.resolve(root, filePath);
  const relative = path.relative(root, absolute);
  if (relative.startsWith("..") || path.isAbsolute(relative)) return null; // outside the project
  if (relative.split(path.sep).includes("node_modules")) return null;
  return existsSync(absolute) ? { root, absolute, relative } : null;
}

export function lint(root, relative) {
  // Run ESLint's own entry file with Node: no shell, so it behaves the same in PowerShell and Git Bash.
  const bin = path.join(root, "node_modules", "eslint", "bin", "eslint.js");
  if (!existsSync(bin)) return { ok: true, text: "" };
  const result = spawnSync(process.execPath, [bin, "--no-color", "--", relative], {
    cwd: root,
    encoding: "utf8",
    timeout: 90_000,
    windowsHide: true,
  });
  const text = `${result.stdout || ""}${result.stderr || ""}`.trim();
  return { ok: result.status === 0, text };
}

export function answerFor(relative, outcome) {
  if (!outcome.text) return null; // errors AND warnings both print text
  return {
    hookSpecificOutput: {
      hookEventName: "PostToolUse",
      additionalContext: `ESLint reported problems in ${relative} after your edit (not blocking, please fix):\n${outcome.text.slice(0, 4000)}`,
    },
  };
}

if (isMain(import.meta.url)) {
  const input = parseInput(await readStdin());
  const target = targetFile(input);
  if (target) {
    const answer = answerFor(target.relative, lint(target.root, target.relative));
    if (answer) process.stdout.write(JSON.stringify(answer) + "\n");
  }
}
