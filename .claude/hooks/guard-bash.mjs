// PreToolUse hook for Bash.
//  - ASK (a permission prompt to the owner): "supabase db push" without --dry-run,
//    "git push --force", "git reset --hard".
//  - DENY: commands that read or copy .env, .env.local, .env.*.local and other real env files.
//    .env.example is allowed (it holds names only).
// Best effort: this is a safety net on top of the permission deny rules in settings.json, not a sandbox.

import { isMain, parseInput, preToolUseAnswer, printAnswer, readStdin } from "./lib.mjs";

// A real env file: ".env" or ".env.<something>" (also globs like .env*), not part of a longer word.
// "process.env.X" and "$env:X" do not match because a letter or "$" comes right before "env".
const ENV_TOKEN = /(?<![\w$-])\.env(?:\.[\w*.-]+|\*)?(?![\w-])/gi;

// Words that read, copy, print, search or open a file (including interpreters that can open one).
const READER_WORDS = [
  "cat", "type", "more", "less", "head", "tail", "tac", "nl", "bat", "od", "xxd", "strings", "base64",
  "get-content", "gc", "select-string", "sls", "get-item", "gi", "gci", "import-csv", "out-string",
  "copy-item", "copy", "cp", "xcopy", "robocopy", "move-item", "mv", "ren", "scp", "curl", "wget",
  "grep", "egrep", "rg", "findstr", "awk", "sed", "sort", "cut", "tee", "diff", "source", "dotenv",
  "node", "python", "python3", "ruby", "perl", "php", "deno", "bun", "npx", "code", "notepad", "vim", "nano", "open", "start",
];
const READER_PATTERN = new RegExp(`(?<![\\w-])(?:${READER_WORDS.join("|")})(?![\\w-])`, "i");

function mentionsRealEnvFile(command) {
  const matches = command.match(ENV_TOKEN) || [];
  return matches.some((token) => token.toLowerCase() !== ".env.example");
}

const SEGMENT_SPLIT = /&&|\|\||[;|\n]/;

export function decide(input) {
  if (input.tool_name !== "Bash") return preToolUseAnswer("allow");
  const command = input.tool_input && input.tool_input.command;
  if (typeof command !== "string" || !command.trim()) return preToolUseAnswer("allow");

  // 1) Env files: deny first, because it is the strictest answer.
  if (mentionsRealEnvFile(command) && (READER_PATTERN.test(command) || /[<>]/.test(command))) {
    return preToolUseAnswer(
      "deny",
      "Reading or copying .env, .env.local and .env.*.local is blocked (secrets). " +
        "Use docs/ARCHITECTURE.md section 7 for variable names; .env.example is allowed.",
    );
  }

  // 2) Commands that need the owner's yes. Check each chained command on its own.
  for (const part of command.split(SEGMENT_SPLIT)) {
    if (/supabase(?:\.cmd|\.exe)?\s+db\s+push\b/i.test(part) && !/--dry-run\b/i.test(part)) {
      return preToolUseAnswer(
        "ask",
        "supabase db push (not a dry run) changes the real database. Run `npx supabase db push --remote --dry-run` first and push only with the owner's approval.",
      );
    }
    if (/\bgit\s+(?:-\S+\s+)*push\b/i.test(part) && /(?:\s--force\b|--force-with-lease|\s-f\b|\s\+\S)/i.test(part)) {
      return preToolUseAnswer("ask", "git push --force can overwrite shared history. Confirm with the owner.");
    }
    if (/\bgit\s+(?:-\S+\s+)*reset\b/i.test(part) && /\s--hard\b/i.test(part)) {
      return preToolUseAnswer("ask", "git reset --hard throws away uncommitted work. Confirm with the owner.");
    }
  }
  return preToolUseAnswer("allow");
}

if (isMain(import.meta.url)) {
  const input = parseInput(await readStdin());
  printAnswer(decide(input));
}
