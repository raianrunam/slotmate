import { expect, test } from "@playwright/test";
import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

// Phase 16: the Claude Code hooks in .claude/hooks. Every script is started as a real process and fed
// sample JSON on stdin, the same way Claude Code does it. No network, no database, no secrets.

const root = process.cwd();
const hooks = path.join(root, ".claude", "hooks");

type Answer = { decision: string; reason: string } | null;

function run(script: string, input: object): { answer: Answer; stdout: string; status: number | null } {
  const result = spawnSync(process.execPath, [path.join(hooks, script)], {
    input: JSON.stringify(input),
    encoding: "utf8",
    env: { ...process.env, CLAUDE_PROJECT_DIR: root },
    windowsHide: true,
  });
  const stdout = (result.stdout ?? "").trim();
  if (!stdout) return { answer: null, stdout, status: result.status };
  const parsed = JSON.parse(stdout);
  const out = parsed.hookSpecificOutput;
  return {
    answer: { decision: out.permissionDecision, reason: out.permissionDecisionReason },
    stdout,
    status: result.status,
  };
}

const bash = (command: string) => run("guard-bash.mjs", { tool_name: "Bash", tool_input: { command } });
const edit = (tool: string, file: string) => run("protect-migrations.mjs", { tool_name: tool, tool_input: { file_path: file } });

test.describe("protect-migrations (pushed migrations are never edited)", () => {
  const tracked = "supabase/migrations/20261114153109_bookings.sql";

  for (const tool of ["Edit", "Write", "MultiEdit"]) {
    test(`denies ${tool} on a tracked migration (relative path)`, () => {
      const r = edit(tool, tracked);
      expect(r.answer?.decision).toBe("deny");
      expect(r.answer?.reason).toContain("pushed migrations are never edited; create a new one");
      expect(r.status).toBe(0);
    });
  }

  test("denies an absolute Windows-style path to a tracked migration", () => {
    const r = edit("Edit", path.join(root, tracked));
    expect(r.answer?.decision).toBe("deny");
  });

  test("denies a path that sneaks in with ..", () => {
    const r = edit("Edit", "supabase/functions/../migrations/20261114153109_bookings.sql");
    expect(r.answer?.decision).toBe("deny");
  });

  test("allows a brand new (untracked) migration file", () => {
    expect(edit("Write", "supabase/migrations/29991231235959_new_one.sql").answer).toBeNull();
  });

  test("allows other files, other tools and empty input", () => {
    expect(edit("Edit", "src/lib/utils.ts").answer).toBeNull();
    expect(edit("Edit", "docs/DATABASE.md").answer).toBeNull();
    expect(run("protect-migrations.mjs", { tool_name: "Read", tool_input: { file_path: tracked } }).answer).toBeNull();
    expect(run("protect-migrations.mjs", {}).answer).toBeNull();
  });

  test("garbage on stdin does not crash and allows", () => {
    const result = spawnSync(process.execPath, [path.join(hooks, "protect-migrations.mjs")], { input: "not json", encoding: "utf8" });
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe("");
  });
});

test.describe("guard-bash: ask", () => {
  const asked = [
    "npx supabase db push --remote",
    "supabase db push",
    "supabase.cmd db push --remote",
    "npx supabase db push --remote --dry-run && npx supabase db push --remote",
    "git push --force",
    "git push origin main --force",
    "git push -f origin main",
    "git push --force-with-lease",
    "git reset --hard",
    "git reset --hard HEAD~3",
    "git status; git reset --hard origin/main",
  ];
  for (const command of asked) {
    test(`asks: ${command}`, () => {
      expect(bash(command).answer?.decision).toBe("ask");
    });
  }
});

test.describe("guard-bash: deny env files", () => {
  const denied = [
    "cat .env",
    "cat .env.local",
    "cat ./.env.local",
    "type .env.local",
    "more .env.production.local",
    "less .env.development.local",
    "Get-Content .env.local",
    "Get-Content -Path .\\.env.local -Raw",
    "gc .env",
    "Copy-Item .env.local ..\\leak.txt",
    "cp .env /tmp/x",
    "head -n 3 .env.local",
    "grep SECRET .env*",
    "Select-String -Path .env.local -Pattern KEY",
    "node -e \"console.log(require('fs').readFileSync('.env.local','utf8'))\"",
    "cat .env.example .env.local",
    "git status && cat .env",
    "echo hi > .env",
  ];
  for (const command of denied) {
    test(`denies: ${command}`, () => {
      expect(bash(command).answer?.decision).toBe("deny");
    });
  }
});

test.describe("guard-bash: allow", () => {
  const allowed = [
    "cat .env.example",
    "Get-Content .env.example",
    "type .\\.env.example",
    "npx supabase db push --remote --dry-run",
    "npx supabase db push --dry-run --remote",
    "git push",
    "git push origin main",
    "git reset --soft HEAD~1",
    "git status",
    "npm run test:unit",
    "node -e \"console.log(process.env.NODE_ENV)\"",
    "echo $env:PATH",
    "git diff -- docs/ARCHITECTURE.md",
    "ls",
  ];
  for (const command of allowed) {
    test(`allows: ${command}`, () => {
      expect(bash(command).answer).toBeNull();
    });
  }

  test("ignores other tools and empty commands", () => {
    expect(run("guard-bash.mjs", { tool_name: "Edit", tool_input: { command: "cat .env" } }).answer).toBeNull();
    expect(bash("").answer).toBeNull();
    expect(run("guard-bash.mjs", {}).answer).toBeNull();
  });
});

test.describe("lint-after-edit (never blocks)", () => {
  // Each test makes its own folder (tests run in parallel workers), inside the project so ESLint
  // applies the real config. The folder name must not start with a dot (ESLint skips those).
  const made: string[] = [];
  const tempDir = () => {
    const dir = path.join(root, "tests", "hook-lint-" + Math.random().toString(36).slice(2, 10));
    mkdirSync(dir, { recursive: true });
    made.push(dir);
    return dir;
  };
  const lintRun = (file: string, tool = "Write") =>
    spawnSync(process.execPath, [path.join(hooks, "lint-after-edit.mjs")], {
      input: JSON.stringify({ tool_name: tool, tool_input: { file_path: file } }),
      encoding: "utf8",
      env: { ...process.env, CLAUDE_PROJECT_DIR: root },
      windowsHide: true,
    });

  test.afterEach(() => {
    for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  test("reports an ESLint problem (even a warning) as extra context and exits 0", () => {
    const file = path.join(tempDir(), "bad.ts");
    writeFileSync(file, "const unusedValue = 1;\nexport {};\n");
    const r = lintRun(file);
    expect(r.status).toBe(0);
    const out = JSON.parse(r.stdout).hookSpecificOutput;
    expect(out.hookEventName).toBe("PostToolUse");
    expect(out.additionalContext).toContain("unusedValue");
    expect(out.additionalContext).toContain("not blocking");
  });

  test("prints nothing for a clean file", () => {
    const file = path.join(tempDir(), "good.ts");
    writeFileSync(file, "export const answer = 42;\n");
    const r = lintRun(file);
    expect(r.status).toBe(0);
    expect(r.stdout.trim()).toBe("");
  });

  test("ignores non-TypeScript files, missing files and other tools", () => {
    expect(lintRun("docs/DATABASE.md").stdout.trim()).toBe("");
    expect(lintRun("src/does-not-exist.ts").stdout.trim()).toBe("");
    expect(lintRun("src/lib/utils.ts", "Read").stdout.trim()).toBe("");
  });
});

test("settings.json wires every hook script and keeps the .env deny rules", async () => {
  const fs = await import("node:fs/promises");
  const settings = JSON.parse(await fs.readFile(path.join(root, ".claude", "settings.json"), "utf8"));
  const text = JSON.stringify(settings.hooks);
  for (const script of ["protect-migrations.mjs", "guard-bash.mjs", "lint-after-edit.mjs"]) expect(text).toContain(script);
  expect(settings.permissions.deny).toEqual(expect.arrayContaining(["Read(./.env)", "Read(./.env.local)", "Read(./.env.*.local)"]));
});
