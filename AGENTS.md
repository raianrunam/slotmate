<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# SlotMate — Project Instructions

## 1. Project overview

SlotMate is a SaaS resource-booking and management platform.

The application uses Next.js App Router, TypeScript, React, Tailwind CSS, Supabase/PostgreSQL, Stripe, Recharts and Playwright as documented in the project architecture and requirements.

The project owner is a beginner learning software engineering and agentic AI. Explain technical decisions and changes clearly.

## 2. Required reading before implementation

Before starting a new task, inspect the relevant project documentation.

Read these files when beginning a new feature, architecture change or major task:

1. `docs/MASTER_PROMPT.md`
2. `docs/PROJECT_REQUIREMENTS.md`
3. `docs/ARCHITECTURE.md`
4. `docs/DATABASE.md`
5. This `AGENTS.md`

Do not assume the documentation is complete or that a feature has already been implemented. Inspect the actual source code before making changes.

If documentation conflicts, identify the conflict and ask the project owner before making a consequential architectural decision.

## 3. Development workflow

Follow this sequence:

### Plan

- Understand the task.
- Inspect relevant files and dependencies.
- Identify the files that need changes.
- Explain the proposed approach.
- Identify risks and unresolved questions.

### Implement

- Make only the changes needed for the approved task.
- Follow existing project conventions.
- Avoid unnecessary dependencies.
- Do not rewrite unrelated code.
- Keep changes small and understandable.

### Verify

- Run appropriate linting, type checks, builds or tests when available: `npx tsc --noEmit`, `npx eslint`, and `npm run test:db` whenever the database or its access rules changed.
- Database tests use real paths only (see `docs/TESTING.md`): no direct Postgres connection and no extra grants just to make a test pass.
- Do not claim a check passed unless it was actually executed.
- Report errors honestly.
- Explain any verification that could not be performed.

## 4. Database and Supabase safety

The database design is documented in `docs/DATABASE.md`.

Important approved decisions:

- DB1–DB17 are approved.
- S1: Server-side resource image uploads using the service-role key, with server-side validation.
- S2: Owners select one workspace and three resources during Pro downgrade; no automatic oldest-first selection.

Security requirements:

- Never expose the Supabase service-role key to browser code.
- Never bypass documented RLS and function permission rules.
- Server-only functions must follow the documented permission restrictions.
- Never weaken security policies to make an implementation work.

Current project boundary:

- Migrations 1–7 are applied to the development Supabase project. The design is in `docs/DATABASE.md` (section 9 lists the migrations); the tests are in `docs/TESTING.md`.
- Never edit a migration that has already been pushed. Any change is a NEW migration, and a new migration needs the project owner's explicit authorization.
- Do not create or apply migrations, run `supabase db push`, or change Supabase data or settings unless the project owner explicitly authorizes that specific task. Read-only checks (`supabase db query --remote --read-only`) are allowed when a task asks for them.
- `npm run test:db` is authorized as a verification step. It creates and deletes only throw-away test users (addresses like `slotmate-test-<random>@example.com`, and everything they own) in the linked development project, and must leave nothing behind. Any other write to Supabase still needs the owner's explicit authorization for that task.
- Supabase CLI v3 needs `--remote` for the linked cloud project. There is no Docker and no local Supabase.
- Never claim that a database change has been tested against Supabase unless it actually has been.

## 5. Git and file safety

- Work on the currently assigned branch.
- Never switch branches without permission.
- Never stage, commit, push, reset, rebase or delete files unless explicitly authorized.
- The repository is PUBLIC. Never commit keys, secrets, the Supabase project reference or personal email addresses. Never stage `.env*` files (only `.env.example`, which has names and no values).
- Inspect `git status` before and after significant work.
- Preserve untracked files.
- Never discard another agent's changes.
- Never overwrite an existing document without inspecting it first.

## 6. Multiple coding agents

Only one coding agent may modify the project at a time.

Other agents may review or analyze files, but must not edit files while another agent is implementing changes.

Before starting:

- Inspect the current Git status.
- Check for existing uncommitted or untracked work.
- Do not assume changes belong to you.

After finishing:

- List every file modified.
- Summarize the changes.
- Identify anything not verified.
- Do not commit unless explicitly instructed.

## 7. Next.js and dependency rules

The existing Next.js-generated instructions at the top of this file are mandatory.

Before writing Next.js code:

- Read the relevant documentation under `node_modules/next/dist/docs/`.
- Check the installed Next.js version and APIs.
- Do not rely on outdated knowledge or deprecated conventions.

Do not install, upgrade or remove packages without approval.

## 8. Beginner-friendly communication

The project owner is learning coding and agentic engineering.

Therefore:

- Provide Windows PowerShell-compatible commands when terminal instructions are required.
- Give instructions in manageable steps.
- Do not overwhelm the owner with unnecessary technical detail.
- Do not assume the owner understands a command simply because it was executed.

## 9. Completion report

At the end of every implementation task, report:

1. What was completed.
2. Files created or modified.
3. Important technical decisions.
4. Commands and checks actually executed.
5. Verification results.
6. Remaining issues or risks.
7. Whether any database, environment, dependency or Git changes occurred.

Do not claim completion of work that has not been verified.

## 10. Change history

- 2026-11-14 (Phase 5): updated the database boundary (migrations 1–7 are applied; pushed migrations are never edited; CLI v3 needs `--remote`), added the verification commands, the real-paths-only test rule and the narrow authorization of `npm run test:db`, and added the public-repository rule. Claude-specific rules live in `CLAUDE.md`, which imports this file.