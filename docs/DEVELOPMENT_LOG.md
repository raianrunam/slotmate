# SlotMate — Development Log

Last updated: 2026-11-14 · Phase 5

This is the project's diary: what was done in each phase, what went wrong, how it was caught, and what is still open. It is written for the project owner (who is learning software engineering and agentic AI) and for anyone who reads the repository. Dates are real; commit hashes can be looked up with `git show <hash>`. The raw review and test reports mentioned here are kept in a notes folder outside the repository.

Phases come from `docs/MASTER_PROMPT.md`. Phases 1–5 are done; 6–18 are planned (see `README.md`).

Words used here: a **subagent** is a separate AI agent that the main agent starts to do one job (here, to review work with a fresh mind and no write access); a **co-author line** is the last line of a commit message that names the AI model that helped (for example "Claude Opus 5.5" or "Claude Sonnet 5.5"); **deny rule** is a setting that forbids an agent a specific action; **row level security (RLS)**, **migration** and the other database terms are explained in `docs/DATABASE.md` section 1.

---

## Phase 1 — Understand Claude Code and prepare the environment

**Date:** done before the first commit (2026-11-12 or earlier). This phase was not logged in detail at the time.

- Claude Code was set up as the main coding agent. Codex was also used for some tasks (see mistake 7).
- Settings: the `agentFeedback` experiment was turned off in the same commit that added the master prompt (`0103b4f`).

## Phase 2 — Create the GitHub repository and initialize the project

**Date:** 2026-11-12.

- `5cee9a7` Initial commit from Create Next App.
- `12ffa3b` Moved the `app` directory into `src/` (mistake 6 below).
- `dfe1cc4` Added a placeholder heading to prove the app runs.

## Phase 3 — Define requirements and architecture

**Date:** 2026-11-12.

- `0103b4f` Added `docs/MASTER_PROMPT.md`.
- `a4a01c3` Added `docs/PROJECT_REQUIREMENTS.md`: roles, functional requirements with IDs (authentication, dashboard, workspaces, resources, availability, public booking, booking management, notifications, analytics, embed widget, billing), non-functional requirements and 27 approved decisions (D1–D27; the count in the commit message matches the document, checked on 2026-11-14).
- `88921cc` Added `docs/ARCHITECTURE.md`: decisions A1–A20 and L1–L7, the browser/server split, where each security check happens. The rate limit was changed from one global limit to one **per visitor per workspace** (mistakes 4 and 5 below).

## Phase 4 — Design the database and build it

**Dates:** design 2026-11-12 to 2026-11-13; migrations and tests 2026-11-14.

### 4a. Design (2026-11-12 to 2026-11-13)

- `a07ba4e` Added `docs/DATABASE.md`: 11 tables, enums, functions and triggers, row level security, function permission rules, special designs (double-booking prevention, monthly counter, rate limit, status token, Stripe event memory, downgrade lock), the migration plan and the test plan T1–T21. Decisions DB1–DB16 were approved on 2026-11-12; DB17, S1 and S2 on 2026-11-13. The docs were aligned after S1 and S2 (mistake 8).
- `53621d8` Added the shared agent instructions to `AGENTS.md`.

### 4b. Tooling and environment (2026-11-14)

- `0dfb743` Added the environment template and blocked agent reads of `.env` files through a deny rule in `.claude/settings.json`. Three findings:
  - The deny rule blocked even a shell read of `.env.local`, not only the agent's file-read tool. That is the intended protection.
  - The ignore pattern `.env*` also ignored `.env.example`, the file that must be committed. Fixed by adding `!.env.example` to `.gitignore`.
  - The values in `.env.local` had the **variable names doubled**. It was caught by a prefix check.
- `2815a29` Added the Supabase client libraries and the CLI. `npm audit` reported 7 moderate issues; deferred to Phase 17.
- `c79d609` Initialized the Supabase CLI config and linked the development project.
- **Supabase CLI v3 needs `--remote`** for every command that talks to the cloud project (there is no Docker, so the default local target does not exist). `db push`, `db query`, `gen types` all need it.

### 4c. Migration 1 (2026-11-14)

- Pushed `extensions_enums_helpers` (`0a8d006`) and verified it with five read-only checks (extension and schema, enum values and order, the `uuid` operator class for the exclusion constraint, `set_updated_at` locked down, default privileges). All passed. Two facts from the checks shaped every later migration:
  - **New tables get `service_role` only `MAINTAIN`, `REFERENCES`, `TRIGGER` and `TRUNCATE`** by default. It has no `SELECT`, `INSERT`, `UPDATE` or `DELETE`, so migration 7 must grant what the server needs explicitly.
  - Because of the global revoke of `EXECUTE` from `PUBLIC`, any function used inside an RLS policy would need an explicit `EXECUTE` grant for `authenticated`. (As built, no policy calls our functions, so none is needed.)

### 4d. Migration 2 and the staged workflow (2026-11-14)

- Work was done in stages with an approval between them: an **outline** first (every table, column, function, grant and anything not in `DATABASE.md` marked FLAG), then the SQL and a **dry run**, then the push.
- The outline caught a **conflict between my own prompt and `DATABASE.md` section 6.1 rule 1** about where the `EXECUTE` grant for `current_plan` belongs (my prompt said migration 7; the rule says the migration that creates the function). The agent flagged it instead of choosing silently; I decided to follow the document.
- A read-only check found 0 existing Auth accounts, so no backfill of profiles was needed.

### 4e. Migrations 3–7 and three independent reviews (2026-11-14)

Migrations 3–7 were written as files in one batch, then reviewed by **separate, fresh-context, read-only reviewer subagents** that were given only `DATABASE.md`, `ARCHITECTURE.md` and the migrations. Their reports were saved unedited. Three rounds:

- **Round 1** found no critical problem and these real bugs, fixed before anything was pushed:
  - The repeated-hour check in `submit_booking` was **backwards**: PostgreSQL resolves an ambiguous local time to the later copy, so the first draft refused the first copy and accepted the second.
  - `service_role` kept `TRUNCATE` on every table, which skips RLS and triggers and could have wiped the monthly usage counter.
  - The plan-limit triggers ran **before** RLS, so an owner could learn whether another account existed or was at its limit.
  - `image_path` had no length limit; the storage bucket insert would have failed if the bucket already existed.
  - It also raised design questions that became decisions Q1–Q12 (below), including that tests T9, T11 and T13 as written needed direct writes that `service_role` deliberately does not have.
- **Batch B was refused by the agent.** I asked for the push on the condition that a re-review found nothing at medium severity or above. There had been no re-review, and the first review had medium findings, so the agent stopped and explained instead of pushing. (Correct behaviour; recorded as a positive example.)
- **Round 2** (after my answers to Q1–Q12 and the change of the image path to a protected function) found a **MEDIUM** bug that round 1 had missed: a slot's *end* time could fall in the wrong copy of a repeated hour, making a slot one hour too long so that it overlapped the next slot. No double booking was possible (the overlap rule still held), but real slots became unbookable twice a year. The agent stopped again and did not push. I decided R1–R4 (below).
- **Round 3** found only low-severity items and traced `submit_booking` by hand for four time zones (London, Berlin, New York, Sydney) on the 2026 clock-change dates. Result: correct for 30-, 60- and 90-minute slots. One low-severity limitation remains open (45-minute-type slots on a clocks-forward day).
- **Model switch.** Midway through this work I changed the session's model (Opus 5.5 to Sonnet 5.5, with `/model`). Commits `2815a29` and `0a8d006` carry the Opus co-author line, and commits from `ef94364` onwards carry Sonnet.

### 4f. Push, verification, types (2026-11-14)

- `ef94364` Pushed migrations 2–7 to the development project after the dry run listed exactly those six. Read-only checks a–h and one extra all passed: 11 tables with RLS; no privileges for `anon`; the exact grants of migration 7; 18 functions, all with a fixed `search_path`, none executable by `anon` or `authenticated`; 21 policies; 16 triggers including `on_auth_user_created`; the seed limits (Free 1/3/100, Pro 5/25/1000); the `bookings_no_overlap` constraint; the image bucket (public, 2 MiB, JPG/PNG/WebP). The check also proved the default-privilege revoke for **future** tables worked, which the reviewer had said could not be shown by reading the SQL.
- `bc8b153` Generated the TypeScript types (`src/types/database.types.ts`); `npx tsc --noEmit` passed.
- No pushed migration was edited at any point. The fixes from the reviews were made in the files before they were pushed.

### 4g. Database tests (2026-11-14)

- `d377a77` Added Playwright (no browser) and the tests T1–T8 and T19, using **real paths only**: the server key calling real functions, really logged-in owners, and the public key with no login (decision Q4; see `docs/TESTING.md`). These are 9 of the 21 designed tests, run as 19 Playwright test cases. All 19 passed on the first run in 44 seconds, and a read-only count afterwards found 0 Auth users and 0 rows in every table the tests use.
- T19 confirmed the sign-up trigger on `auth.users` works. A broken trigger there would have blocked all sign-ups, so this was the riskiest unverified item.
- T8 confirmed the double-booking rule and the atomic usage counter under 3 simultaneous requests over 20 rounds.

### Decisions made in Phase 4 (full text in `docs/DATABASE.md` section 12)

- Q1 extra `SECURITY DEFINER` functions approved. Q2 `set_resource_image` instead of a raw `UPDATE` grant. Q3 column-limited booking reads for `service_role`. Q4 real paths only in tests. Q5 downgrade selection is one workspace and zero to three resources. Q6 owners send `owner_id` on insert only. Q7 first copy of a repeated hour is bookable, and slots crossing a clock change are allowed. Q8 `TRUNCATE`, `TRIGGER`, `REFERENCES` revoked from `service_role`. Q9 no deleting individual bookings on locked items. Q10 deadlocks accepted, app retries once. Q11 public pages read tables directly with `service_role` in version 1. Q12 the dashboard repeats the Pro rule from the subscription row, with a test.
- R1 the end of a slot also uses the first copy of a repeated hour. R2 all write Server Actions, including booking submission, retry once on `40P01`. R3 the default-privilege revoke for future tables. R4 the image path must start with `<owner_id>/<resource_id>/` and contain no `..`.
- Recorded: concurrent duplicate Stripe deliveries may both be processed; that is harmless because the webhook re-fetches the subscription's state from Stripe (A14).

## Phase 5 — Create CLAUDE.md and project documentation

**Date:** 2026-11-14.

- Added `CLAUDE.md` (imports `AGENTS.md` instead of copying it, plus Claude-specific rules), `README.md` (replaced the create-next-app template), `docs/TESTING.md` and this log.
- Updated `AGENTS.md` (the database boundary was out of date, the verification commands, the real-paths rule, the public-repository rule), `docs/DATABASE.md` and `docs/ARCHITECTURE.md` to match what was built and tested; each has a change-history note at the end. `.gitignore` now ignores `test-results/` and `playwright-report/`.
- A fresh, independent reviewer subagent checked the documents against the SQL, the tests, the evidence files and for secrets. Its report is kept unedited in the notes folder (`phase5-review.txt`). It found one high-severity problem (this log said a documentation review had already happened and been fixed, before any review existed: mistake 17), several medium ones (overstated verification in the README, a rule conflict between `AGENTS.md` and `CLAUDE.md`, undocumented trigger error names) and a number of low ones. All were fixed before the documents were committed, except the privacy question about the placeholder page (see "Open items").
- **Blocked by my own rule:** the deny rule that protects the secrets also blocks the agent from reading `.env.example`, so the agent could not edit the comment on the project URL variable. See "Open items".

---

## Phase 6 — Design the frontend and reusable UI components

**Date:** 2026-11-14.

- `501010f` Housekeeping first: the deny rules in `.claude/settings.json` now block only the real env files (`.env`, `.env.local`, `.env.*.local`, `.env.development`, `.env.production`, `.env.test`), so `.env.example` (names only) is readable, and its URL comment was fixed. The running session kept enforcing the old rule until restarted, so the template was read through the shell.
- **Plan first**, saved in the notes folder (`phase6-plan.txt`): design direction (clean SaaS, neutral greys plus one indigo accent, light and dark, accessible contrast), colour tokens, fonts (Geist, already used), the component list, every route and the folder structure. The Next.js guides in `node_modules/next/dist/docs` were read before writing code. Two facts shaped the build: this project has Cache Components on, so route params and search params may only be read inside `<Suspense>`; and the installed Next.js 16.4.6 uses the stable `retry` prop in `error.tsx`.
- `bddc602` The build: shadcn/ui (Radix base, Nova preset, 17 components), design tokens in `globals.css`, `src/lib/plans.ts` (Free 1/3/100 and Pro 5/25/1000, $9.99, mirroring the `plan_limits` table), shared components (header, footer, dashboard sidebar and mobile sheet menu, notification badge, upgrade prompt, form field, empty/error/loading states, 20-per-page pagination, delete confirmation, status badges, plan cards) and the page shells: landing, `/login`, `/signup`, `/forgot-password`, `/reset-password`, `/dashboard` with seven sections, `/book/[slug]`, `/booking/[code]`, `/embed/[slug]`, a `/design` reference page, a 404 and an error page. Every shell says "Placeholder", reads no data and has no login logic. The create-next-app leftovers (favicon, sample SVGs, the old page that contained a personal name) are gone. Feature folders exist with one README line each.
- `1f222cb` UI checks with Playwright and Chromium (`npm run test:ui`): 88 checks at 375, 768 and 1280 px, with screenshots saved outside the repository.
- **Independent review** (fresh read-only reviewer; report kept unedited in the notes folder as `phase6-review.txt`, with a record of the fixes). No data access, secrets or Next.js errors were found. It found real accessibility problems, all fixed: focus rings on hand-styled links were about 2:1, form control borders and the unchecked switch about 1.3:1, destructive button text about 4:1, wrong heading levels, tab semantics without panels, the booking time hidden on phones, and a few layout and tap-size problems. Several of my own tests could not fail; the stronger tests then found a real bug (see mistake 18).
- **New package, checked:** this shadcn version installs a small `cn` package instead of `clsx` and `tailwind-merge`. It belongs to the shadcn-ui organization on GitHub (MIT, no dependencies, maintained by shadcn) and requires Node 22 or newer, so the project's minimum Node version is now 22.

## Agent mistakes and how they were caught

Honest record of things the agents got wrong. Mistakes 1–9 happened in Phases 1–4a; 10–13 and 16 in Phase 4e (the migration reviews); 15 in Phase 4d; 14 and 17 in Phase 5.

1. **Dropped notes.** Claude Code said "all recorded" but had dropped my notes on D24 and D27. Found with a text search (`Select-String`).
2. **Wrong tool claim.** Claude Code claimed VS Code's Ctrl+Shift+V renders Mermaid diagrams. It does not without an extension.
3. **Wrong count in a commit message.** A suggested commit message said "27 decisions" for a document that had 20 at that point. Caught by checking the count.
4. **A rate limit that would block a whole campus.** A global per-IP limit would have blocked everyone on shared university Wi-Fi. Changed to one allowance per visitor **per workspace**.
5. **Documents disagreed.** The requirements and the architecture disagreed about the scope of the rate limit. Aligned.
6. **Project layout.** My first Next.js setup had no `src/` folder. Fixed with `git mv` and a `tsconfig` change.
7. **Wrong file names in agent task files.** `codex-task.md` used a wrong file name, and `codex-agents-setup.md` was truncated.
8. **Documentation drift after S1 and S2.** After the two decisions, A4 (four places instead of six), A18 (a fallback that contradicted S2) and the word "fifth" in `DATABASE.md` were out of date. Aligned.
9. **An empty-set loophole.** The definition of a "valid selection" for the downgrade accepted an empty set (everything locked) as valid. Caught while reviewing the design, before any code existed; the rule now says the empty set is not valid.
10. **A backwards time check.** The first `submit_booking` refused the first copy of a repeated hour and accepted the second. Caught by independent review round 1, before the push.
11. **The same hole at the other end.** After the fix, the *end* of a slot could still land in the wrong copy of the repeated hour. Caught by round 2, not by me. Lesson: a fix for one end of a range needs a check of the other end.
12. **Too much access for the server key.** The first grants left `service_role` able to `TRUNCATE` every table. Caught by round 1.
13. **A trigger that ran before the security check.** The limit triggers leaked whether another account existed. Caught by round 1.
14. **Two wrong counts of my own.** In the verification notes and in my chat report I wrote "19 functions" and "15 with elevated rights"; the real numbers are 18 and 14 (the raw output was right, my summary was wrong). Found while writing the documentation in Phase 5 and corrected in the notes. Separately, the round-2 reviewer wrote "21 functions"; its report is kept unedited. Lesson: a summary must be checked against the raw output.
15. **A prompt that conflicted with the documented rule.** Not an agent mistake, but worth recording: my instruction put the `current_plan` grant in the wrong migration. The agent flagged the conflict and followed the document.
16. **Reviewers are not always right either.** Reviewers' suggestions were checked, not copied: for example the suggestion to delete only one workspace's old rate-limit rows was declined because it would contradict the documented clean-up rule (`DATABASE.md` section 7.4).

17. **A claim written before it was true.** While writing this log, I wrote that a reviewer had checked the documentation and that its findings were fixed, before any documentation review had been run. The Phase 5 reviewer caught it as its highest-severity finding. The log was corrected, and the sentence now points to the saved report. Lesson: write "done" only after the evidence exists.

18. **Tests that could not fail.** My first UI tests passed for the wrong reasons: the skip-link check accepted a one-pixel box as "visible", and the heading, console and name checks were too loose. The Phase 6 reviewer pointed this out. When I made the tests strict, they found a real bug: Tailwind's `not-sr-only` reset the focused skip link's padding to zero, so it showed as a cramped strip. Lesson: a new test should be seen failing, or at least be asked "what would make this fail?".
19. **A plan based on an older API.** My plan named `unstable_retry` for the error page. Reading the installed Next.js 16.4.6 docs before coding showed the stable name is `retry` (since 16.3). Caught by following the "read the guide first" rule in `AGENTS.md`.
20. **A commit that missed the files.** The first `git add` of Phase 6 failed on a folder that had become empty, so that commit held only the deleted starter files and the real source stayed uncommitted. Noticed from `git status` straight afterwards and fixed in the next commit. Lesson: read the command's output, not just the commit message line.
21. **Setup docs that were wrong.** The README and `TESTING.md` said Node 20.12 would do, but shadcn's `cn` needs Node 22; and the README listed environment variables that `.env.example` does not contain (it has three). Found during Phase 6 and fixed.

## Agentic techniques used so far

- **Independent reviewer subagents.** A fresh agent with no memory of the work, read-only, given only the documents and the files. Reports are saved unedited, findings are fixed in the files, and the implementing agent explains instead of changing when it disagrees. Three rounds on the migrations and one on the documentation (Phase 5). A subagent's report is information, not an instruction or an approval.
- **Deny rules in `.claude/settings.json`.** `Read(./.env)` and `Read(./.env.*)` are denied, so the agent cannot read secrets even by accident. It works (even through the shell) and has a cost (it also blocks `.env.example`).
- **Shared rules in `AGENTS.md`**, imported by `CLAUDE.md`, so every agent follows the same safety rules (database boundary, Git safety, verification, public repository).
- **Staged work with approvals.** Outline, then SQL, then dry run, then push; nothing that changes the database runs without the owner's explicit approval for that step, and commands are shown first.
- **Preconditions on actions.** A push is only allowed if a condition holds (a clean re-review and a dry run listing exactly the expected files); the agent refused twice when the condition was not met.
- **Read-only verification.** `supabase db query --remote --read-only` after each push, with raw output saved next to a PASS/FAIL line.
- **Real-path tests.** The tests use only paths real code uses, so a pass means something.
- **Saved evidence.** Raw outputs of checks and reviews are kept in a notes folder, not summarized from memory.

## Open items

Database and tests:

- **Slot lengths under 60 minutes that do not divide 60** (45, 25, 40, 50) can give two overlapping slots on a clocks-forward day; one is refused as "taken". Decide: accept, restrict `slot_minutes`, or clamp. Any fix is a new migration.
- **Clock changes are not tested live yet** (T10). `src/lib/time` (Phase 10) must follow the same two rules (first copy of a repeated hour, for the start and the end).
- **T9–T18, T20 and T21** are not written yet (`docs/TESTING.md` lists a proposed phase for each). T8 should use about 10 concurrent requests in Phase 17.
- **Deadlock retry** (`40P01`, once) must be implemented in every write Server Action, including booking submission (`DATABASE.md` section 7.10).
- **Image paths (Phase 9):** the server must generate safe file names (`set_resource_image` checks only the folder and `..`), and the order "store the file, then record the path" or the reverse needs a decision that also handles a failed write.
- **Booking reads:** server code must name columns (`select *` on `bookings` fails for `service_role` by design).
- **Q12:** a test that the dashboard's Pro rule and the database's `current_plan` agree.
- **The sign-up trigger** is proved through the Auth admin API; the real sign-up form with email confirmation is still to be checked in Phase 7, including Supabase's built-in email limits.

Project and tooling:

- **`.env.example` comment.** The comment on the project URL variable should read "Project Settings > Data API (or the Connect button)". The agent could not edit it because the deny rule also blocks reading `.env.example`. Either edit the comment by hand, or narrow the deny rule (for example deny `.env.local` and `.env.*.local` only) and let the agent do it.
- **`npm audit`**: 7 moderate issues, deferred to Phase 17.
- **Mermaid diagrams** in `docs/DATABASE.md` (one) and `docs/ARCHITECTURE.md` (four) have not been rendered by a tool yet.
- **Placeholder page and a personal name** (found in Phase 5): resolved in Phase 6. The old placeholder page was replaced by the landing page, which credits only the GitHub handle.
- **Phase assignments for the planned tests** in `docs/TESTING.md` are a proposal.
- **Automatic test runs** (a pipeline) do not exist yet; the database tests and the UI checks run by hand.

Interface (Phase 6):

- **Node version:** the minimum is now Node 22 (the `cn` package). `package.json` has no `engines` field and `@types/node` is still `^20`; adding them was outside Phase 6's authorization.
- **`.env.example`** has only three variables; `NEXT_PUBLIC_APP_URL` and `RATE_LIMIT_SECRET` (and the Stripe ones) should be added to it in the phase that first uses them.
- **Duplicated styling:** the focus-ring classes and the phone-friendly sizes (`h-10 sm:h-8`) are still copied across components; a shared constant or button/input sizes would be cleaner.
- **No automatic contrast or axe-core scan** (a new package would need approval); contrast is checked from the tokens in review.
- **Embed shell:** it follows the viewer's light or dark setting; the owner's saved theme (EMBED-04) arrives in Phase 14. The iframe header rules for `/embed` are also Phase 14.
- **Placeholders to replace:** the landing page copy is a draft (Phase 18); every dashboard and booking shell is replaced by its real feature phase.

---

## Change history

- **2026-11-14** — Created (Phase 5) with entries for Phases 1–5.
