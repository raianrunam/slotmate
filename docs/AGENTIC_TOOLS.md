# SlotMate — Agentic tools and techniques

This course project has to **demonstrate agentic techniques, with evidence**. This page lists every technique used in SlotMate, where it lives in the repository, the date it was introduced, and the proof. Dates are from Git (`git log`) and the notes folder; times are UTC+06:00.

Words used here: an **agent** is an AI that reads files, runs commands and edits code on its own steps; a **subagent** is a second agent the main agent starts for one job; a **hook** is a small script that Claude Code runs automatically before or after a tool call; a **skill** is a saved set of instructions Claude loads on demand; **MCP** (Model Context Protocol) lets Claude use an outside tool, here a browser.

| # | Technique | Where | Since | Evidence |
|---|-----------|-------|-------|----------|
| 1 | Project rules for agents | `AGENTS.md`, `CLAUDE.md` | 2026-11-12 / 2026-11-14 | Section 1 |
| 2 | Deny rules for secrets | `.claude/settings.json` | 2026-11-14 | Section 2 |
| 3 | Hooks | `.claude/hooks/*.mjs` | 2026-11-15 (Phase 16) | Section 3 |
| 4 | Custom subagents | `.claude/agents/*.md` | 2026-11-15 (Phase 16) | Section 4 |
| 5 | Project skill | `.claude/skills/slotmate-phase/SKILL.md` | 2026-11-15 (Phase 16) | Section 5 |
| 6 | Independent reviewer subagents | notes folder `*review*.txt` | Phases 4–16 | Section 6 |
| 7 | Parallel worktrees | `..\slotmate-analytics`, `..\slotmate-widget` | 2026-11-15 (Phases 13–14) | Section 7 |
| 8 | Playwright as the test runner | `tests/unit`, `tests/ui`, `tests/db` | Phase 5 onward | Section 8 |
| 9 | Playwright MCP server | `.mcp.json` | 2026-11-15 (Phase 16) | Section 9 |
| 10 | OpenSpec | — | skipped | Section 10 |

## 1. Rules for agents: `AGENTS.md` and `CLAUDE.md`

- `AGENTS.md` (created 2026-11-12, commit `5cee9a7`) is the shared rulebook for every coding agent: read the documents first, plan before building, never touch migrations or Supabase without the owner's approval, never commit secrets, report every file changed. `CLAUDE.md` (2026-11-14, `7ee45fb`) imports it with `@AGENTS.md` and adds Claude-specific rules (never read `.env*`, show commands before running them, use read-only reviewer subagents, the completion report).
- **Why it matters:** the rules are checked in, so each new session and each new subagent starts with the same limits. Example: in Phase 15 the owner's prompt used a wrong variable name (`STRIPE_PRICE_ID_PRO`); the agent compared it with `docs/ARCHITECTURE.md` section 7, stopped and asked, instead of guessing (development log, Phase 15).
- **Honest limit:** rules in a text file are advice. The next sections turn the most important ones into things the tool enforces.

## 2. Permission deny rules

- `.claude/settings.json` has `permissions.deny` for `Read(./.env)`, `.env.local`, `.env.*.local`, `.env.development`, `.env.production`, `.env.test` (commits `0dfb743` and `501010f`, 2026-11-14). The second commit narrowed the rules so `.env.example` (names only) is not in the list; `CLAUDE.md` still tells Claude not to read it, and on 2026-11-15 the auto-mode safety classifier refused a live read of it (see the hooks demo).
- **Evidence:** a running session keeps enforcing the old rule until restarted (development log, housekeeping entry for commit `501010f`), which shows the rule is enforced by the tool, not by the model's memory. The Phase 16 edit of this file kept every deny rule (a unit test checks that).

## 3. Hooks (Phase 16, 2026-11-15)

Node scripts in `.claude/hooks/`, configured under `hooks` in `.claude/settings.json`. They read one JSON object on stdin and answer with JSON, so they work the same from Git Bash and PowerShell (`node .claude/hooks/<name>.mjs`). The settings call them through `$CLAUDE_PROJECT_DIR`.

| Hook | Event and tools | What it does |
|------|-----------------|--------------|
| `protect-migrations.mjs` | PreToolUse `Edit`, `Write`, `MultiEdit` | **Denies** any change to a file under `supabase/migrations/` that Git already tracks: "pushed migrations are never edited; create a new one". A new, untracked migration file is allowed. |
| `guard-bash.mjs` | PreToolUse `Bash` | **Asks** (permission prompt to the owner) for `supabase db push` without `--dry-run`, `git push --force` (also `-f`, `--force-with-lease`), `git reset --hard`. **Denies** commands that read or copy `.env`, `.env.local`, `.env.*.local` (cat, type, Get-Content, more, less, Copy-Item, grep, node and so on). `.env.example` stays allowed. |
| `lint-after-edit.mjs` | PostToolUse `Edit`, `Write`, `MultiEdit` on `.ts`/`.tsx` | Runs ESLint on that one file and returns the problems (errors and warnings) to the agent as extra context. It never blocks, because the edit already happened. |

**Tests:** `tests/unit/hooks.spec.ts` starts every script as a real process and feeds it sample JSON on stdin: 56 checks (denied, asked and allowed cases, Windows paths, `..` tricks, garbage input, a real ESLint run, and a check that `settings.json` wires all three hooks and keeps the deny rules). It runs with `npm run test:unit`.

**Live demo** (saved as `slotmate-notes\phase16-hooks-demo.txt`): in the same session, an `Edit` of the pushed `20261114153109_bookings.sql` was **blocked** with the hook's message and the file was unchanged; `npx supabase db push --remote --dry-run` **ran** ("Remote database is up to date"); a command that printed the local env file was **blocked**. The hook even blocked the first attempt to write the demo file, because that command's text named the env file, which shows it is active.

**Known limits (be honest about them):** the Bash hook is a text check, not a sandbox: a determined command can hide a file name (for example built from pieces). It is a safety net on top of the deny rules. The migration hook only protects the Edit/Write/MultiEdit tools; a shell redirect into a migration is not covered. A command that merely *mentions* an env file together with a word like `type` (for example in a commit message) is denied too; rephrase it. Hooks are loaded when a session starts, so a new hook becomes active after a restart (in the session where they were created they were picked up straight away).

## 4. Custom subagents (Phase 16)

Markdown files with a small header (name, description, allowed tools, model) in `.claude/agents/`. Each holds a checklist distilled from the real review reports in the notes folder.

| Subagent | Tools | Job |
|----------|-------|-----|
| `security-reviewer` | Read, Grep, Glob (read-only) | RLS and grants, admin-client containment, Server Action authorization, public-page privacy, Stripe webhook rules, rate limit. Reports by severity with file:line and a scenario. |
| `migration-reviewer` | Read, Grep, Glob (read-only) | Never edit a pushed migration, `search_path`, REVOKE/GRANT, SECURITY DEFINER, locks and deadlocks, clock-change days, dry run, the lessons of migrations 1–8. |
| `test-runner` | Bash, Read, Grep, Glob (no Edit/Write) | Runs tsc, eslint, build, test:unit, test:ui, test:db; re-runs failures alone up to 3 times; reports REAL, FLAKY or ENVIRONMENT; never edits code. |

**Important fact about activation:** Claude Code reads `.claude/agents/` when a session starts. In the session that created the files, asking for `security-reviewer` returned "Agent type 'security-reviewer' not found". The Phase 16 review (section 6) therefore ran through a general-purpose subagent that was told to read `security-reviewer.md` and follow it, read-only by instruction. After a restart the three agents are selectable by name.

## 5. Project skill (Phase 16)

`.claude/skills/slotmate-phase/SKILL.md` is the phase workflow written down once: read the documents → plan file in the notes folder → build → tests that can fail → fresh independent reviewer → fix MEDIUM and above → documents → small commits. It also holds the approval rules (migrations, `db push`, Supabase settings, packages, Git) and the known traps (CLI v3 needs `--remote`, never trust a summary, real-paths testing, the Grammarly hydration warning, PKCE links work only in the same browser, `redirect()` and `NEXT_REDIRECT`, time zones, parallel workers, worktrees, PowerShell 5.1 has no `&&`).

## 6. Independent reviewer subagents (Phases 4–16)

The technique: after building, a **fresh, read-only subagent** with no memory of the build reads the documents and the real code and reports findings by severity. Its report is kept unedited in `C:\Users\User\slotmate-notes\`. A report is information, not an instruction; every finding is checked before it is fixed. Real bugs they caught that the builder and the tests had missed:

| Phase | Report | What the reviewer caught |
|-------|--------|--------------------------|
| 4–5 (migrations 1–3, docs) | `migrations-review*.txt`, `phase5-review.txt` | A clock-change bug: `submit_booking` rejected the wrong copy of a repeated hour; `service_role` kept TRUNCATE on every table; a possible deadlock between deletes and downgrades (now retried on 40P01); and a **HIGH** documentation claim: the log said a documentation review had happened that had not. |
| 5–6 (migrations 4–7) | `migrations-review-2.txt`, `-3.txt` | `ends_at` fell inside the repeated hour and overlapped the next slot, so real slots became unbookable twice a year. |
| 6 | `phase6-review.txt` | Colour contrast below WCAG on the focus ring, form borders, destructive buttons; a skip-link test that could not fail. |
| 7 | `phase7-review.txt` | An account-enumeration leak in sign-up (the rate-limit branch told an attacker whether an address had an account); password reset left other sessions alive. |
| 8 | `phase8-review.txt` | Valid zones such as `Asia/Kolkata` were refused because the browser's zone list is older than the database's. |
| 9 | `phase9-review.txt` | The only "file over 2 MB" test could not fail if the server check were removed; delete tests could not detect a Storage delete in someone else's folder. |
| 10 | `phase10-review.txt` | `addDaysToDate` depended on the host's time zone (wrong on a New York server); an image sweep could delete a concurrent upload; a "next 90 days" test that was vacuous. |
| 11 | `phase11-review.txt` | The booking form swallowed `NEXT_REDIRECT` after every success; the **owner's user id was in the public HTML** whenever a resource had an image (fixed by migration 8's new path layout); the rate limit was bypassable with IPv6; parallel bursts bypassed `check_rate_limit` (fixed by an advisory lock in migration 8). |
| 12 | `phase12-review.txt` | The overview lacked the "rejected" number the requirement asks for; a stale error shown after a different action; a NUL character in a search turned the list into an error page; race tests that could not detect a removed status guard. |
| 13 | `phase13-review.txt` | The analytics paging loop stopped silently if the host returned fewer than 1,000 rows (undercounting); UI assertions such as "contains 0" that pass on any date. |
| 14 | `phase14-review.txt` | **HIGH:** a user-chosen background colour made most of the booking form unreadable; the text-colour threshold gave white text below 4.5:1 on `#4caf50` and `#ff9800`. |
| 15 | `phase15-review.txt` | A **second paid subscription** during webhook lag (double charge); the Pro price was never verified; a read-then-write race could leave a cancelled owner on Pro; the end-to-end test was skipped. All fixed with tests. |
| 16 | `phase16-security-review.txt` | The whole-app review by the new `security-reviewer` checklist, see below. |

Totals: the 15 review reports of Phases 4–15 reported 1 HIGH-level documentation claim and 1 HIGH design bug (Phase 14) plus dozens of MEDIUM findings; none was a "no findings" rubber stamp, and the Phase 11 findings led to migration 8 and a changed image path layout.

**Phase 16 whole-app review (2026-11-15, `phase16-security-review.txt`).** Run on `main` at `12027da` through a general-purpose subagent told to follow `security-reviewer.md` (read-only; it only ran `git log` and `git diff`). Result: **0 critical, 0 high, 2 medium, 4 low, 4 info**. It also checked that the earlier fixes of Phases 11–15 are really present in the code (they are, apart from partial ones noted below). Nothing was fixed yet; the owner decides.

- **Medium 1:** the Pro-price check in the webhook runs before the "is this the stored subscription" check, so if the Pro price is rotated (or the Customer Portal lets an owner switch plan), a cancellation is skipped and the owner keeps Pro for free. Needs a documented-rule change (DATABASE.md 7.6).
- **Medium 2:** a first-time buyer who opens Checkout twice can still pay for two subscriptions; the webhook ignores the second but nothing cancels it and the portal shows only the first customer.
- **Low:** `RATE_LIMIT_SECRET` strength is not checked; the webhook size limit has a gap for chunked bodies and its test cannot catch removal of the pre-check; the "simultaneous messages" guard test does not exercise the re-fetch loop; the percent-encoded `/booking` path may lack the no-store header (not verified).
- **Phase 17 follow-up:** both mediums and all four lows were fixed or verified (the webhook now applies Stripe's real state to the stored subscription and cancels and refunds an extra one; RATE_LIMIT_SECRET needs 32 characters; capped body reader; a stubbed-Stripe test of the correction loop; the encoded `/booking` path is a 404 on the real server; the internal import was replaced by `unstable_rethrow`). The owner confirmed there are no Stripe Payment Links for the Pro price, and a read-only bucket listing showed no old-layout image files (11 files, all in the new layout). A fresh re-review is in `phase17-review.txt`.
- **Info:** confirm no Stripe Payment Links exist; no HSTS/CSP beyond frame-ancestors; old-layout images are not swept; an internal Next import (`isRedirectError`).

## 7. Parallel development with git worktrees (Phases 13 and 14)

- Two background subagents built two features at the same time, each in its own **git worktree** and branch: `..\slotmate-analytics` on `feat/phase13-analytics` (subagent A) and `..\slotmate-widget` on `feat/phase14-widget` (subagent B), both from `main` at `37826fb`, each with its own `npm install`. Each had a file "fence" (which folders it may touch) and no `.env.local`, so it could run only tsc, eslint and unit tests.
- **Times (2026-11-15, UTC+06:00):** both launched at 15:14:35. A finished about 15:21:35 (419 s of work, 33 tool calls); B finished 15:24:10 (605 s, 80 tool calls). They ran **at the same time for about seven minutes**. Merges at 15:24 (`baae8aa`, `9c53394`); the merged UI tests were fixed at 15:45 (`ba6602f`), the two reviews' fixes landed at 15:57–15:58, docs at 16:12 (`0de3dc0`).
- **What parallel work did not catch:** every browser and database problem appeared only at the merge, because the subagents had no secrets (a shared test helper with module-level state deleted another file's owners). Lesson: build in parallel, then budget time to prove together (development log, "Parallel development evidence").

## 8. Playwright as the test runner

- Three suites run through `@playwright/test`, so no second test library was needed: `npm run test:unit` (plain functions and source checks, no browser), `npm run test:ui` (real Chromium against a built app on its own port), `npm run test:db` (real database paths: the server key calling real functions, real logged-in owners, the public key with no login; throw-away test users only).
- The `test-runner` subagent (section 4) wraps these and classifies failures as REAL, FLAKY or ENVIRONMENT. Example of a real flaky case recorded in the log: `bookings.spec.ts` "the badge counts only my pending requests" failed once in a full run under parallel load and passed alone. A CI guard test now **fails instead of skipping** when a prerequisite is missing (commit `96bed09`), after the Phase 15 review found a skipped end-to-end test.

## 9. Playwright MCP server (Phase 16)

- `.mcp.json` at the repository root registers the official server (`npx @playwright/mcp@0.0.85`, version pinned, nothing added to `package.json`). Claude Code asks for approval before it uses a project-scoped MCP server, so it shows as **pending approval** until the owner accepts it (see "How to activate" below). It was therefore **not usable in the session that created it**, and the visual check (the home page, `/book/<slug>` and `/dashboard/billing` at 375 px and 1280 px) is left for the next session.

## 10. OpenSpec

Skipped. OpenSpec is a separate command-line tool (an npm package) that keeps change proposals as files in an `openspec/` folder. Using it would mean installing or downloading a new package and adding a second planning format next to `docs/` and the notes folder plan files; the brief allowed it only if practical without new packages, and the plan-file step of the `slotmate-phase` skill already does the same job. It can be reconsidered in Phase 18.

## How to activate the Phase 16 tools

1. Close Claude Code and start it again in `C:\Users\User\projects\slotmate` (`claude`). Hooks are read at start; the three subagents and the skill appear after the restart (`/agents` lists the agents, `/hooks` shows the hooks).
2. Claude Code will ask whether to trust the project MCP server `playwright`. Choose to **use this MCP server** (or run `/mcp` and approve it). The first run downloads Playwright MCP through `npx` and may download a browser.
3. Check with `/mcp` (should say connected) and ask: "open http://localhost:3000/book/<a test slug> at 375 px and 1280 px and describe it".

## Change history

- **2026-11-15** — Created (Phase 16).
