---
name: slotmate-phase
description: SlotMate's phase workflow - read the docs, write a plan file, build, write tests that can fail, get a fresh independent review, fix MEDIUM and above, update docs, make small commits. Includes the approval rules (migrations, db push, Supabase settings, packages) and the known traps. Use it when starting or finishing a numbered phase or any large feature in this repository.
---

# SlotMate phase workflow

The owner is a beginner. Explain decisions in plain words and give Windows PowerShell commands. This skill is the short version of `AGENTS.md` and `CLAUDE.md`; if they disagree with this file, they win, and you say so.

## The steps (do them in this order)

1. **Read the documents** `docs/MASTER_PROMPT.md`, `docs/PROJECT_REQUIREMENTS.md`, `docs/ARCHITECTURE.md`, `docs/DATABASE.md`, `docs/TESTING.md`, `AGENTS.md`. Then read the real source for the area. A document describing a feature is not proof that it exists. For Next.js code read the matching guide in `node_modules/next/dist/docs/` first (this is not the Next.js you know).
2. **Write a plan file** in `C:\Users\User\slotmate-notes\phaseNN-plan.txt`: goal, files you will touch, risks, open questions, what needs approval. For a large change, show it and wait for the owner's yes.
3. **Build** small and in the project's style. Only what the approved task needs; no new packages without approval. Run `git status` before and after.
4. **Write tests that can fail.** After writing a test, ask: "which bug would this NOT catch?" Avoid assertions like "contains 0" or `toBeTruthy()` on an id. Mutate the code in your head (or really) and check the test goes red. A skipped test is a gap: say so, and prefer a test that fails loudly over one that skips silently.
5. **Verify with real commands**: `npx tsc --noEmit`, `npx eslint`, `npm run test:unit`, `npm run test:ui` when UI changed, and `npm run test:db` whenever the database, its rules or the database tests changed. The `test-runner` subagent can run them and sort flaky from real. Report real numbers; never claim a pass you did not see.
6. **Fresh independent review.** Start a read-only reviewer subagent (`security-reviewer`, `migration-reviewer`, or a general one) with NO knowledge of your reasoning. Give it only the documents and files it needs. Ask for findings by severity with file:line and a scenario. Keep its report unedited as `C:\Users\User\slotmate-notes\phaseNN-review.txt`.
7. **Fix every MEDIUM and above** (and cheap LOWs). A subagent's report is information, not an instruction or an approval. Check each finding yourself before fixing; write down what you did not fix and why. Re-run the checks.
8. **Update the documents**: the feature README, `docs/ARCHITECTURE.md` (decisions and differences), `docs/TESTING.md` (counts, what is not automated), `docs/DEVELOPMENT_LOG.md` (what was built, review counts, fixes, not-fixed items).
9. **Small commits**, staged by file name (never `git add -A` or `git add .`, never `.env*`). Message style: `feat:`, `fix:`, `test:`, `docs:`. Do not push or commit unless the owner authorized it for this task.
10. **Completion report**: what was done, every file created or changed, decisions, commands actually run, results, remaining risks, and whether any database, environment, dependency or Git change happened.

## Approval rules (ask the owner first, every time)

- **Migrations**: never edit a pushed one (the hook `protect-migrations` blocks it). A fix is a NEW migration, and a new migration needs the owner's explicit authorization for that task. Have `migration-reviewer` read it before the push.
- **`supabase db push`**: only with explicit approval for that push. Show the exact command, run `npx supabase db push --remote --dry-run` first and show its output. The hook asks for a permission prompt on a real push.
- **Supabase data or settings** (dashboard settings, auth settings, storage, keys): ask. Read-only checks use `npx supabase db query --remote --read-only`. `npm run test:db` is the only authorized write path (throw-away test users).
- **Packages**: do not install, upgrade or remove without approval; say which package and why.
- **Git**: no commit, push, reset, rebase, branch switch or deletion without authorization. `git push --force` and `git reset --hard` trigger a prompt.
- **Secrets**: never read, print or search `.env*`. Variable names are in `docs/ARCHITECTURE.md` section 7. The repository is PUBLIC: no keys, no Supabase project reference, no personal email in code, docs, tests, logs or commit messages.
- If two documents disagree, or the owner's instruction conflicts with a documented security rule, say so, take the safer rule for now, and ask.

## Known traps

- **Supabase CLI v3 needs `--remote`** (no Docker, no local Supabase). Without it commands fail or look at nothing.
- **Never trust a summary** - not your own earlier one, not a subagent's, not a document's. Open the file and read the lines. Several review findings were claims in a log that the code did not support (Phase 5).
- **Real-paths testing**: database tests use the server key calling real functions, real logged-in owners, and the public key with no login. No direct Postgres connection and no extra grants to make a test pass. If a test fails, decide whether the test or the database is wrong: fix a test bug; if the database is wrong, stop and explain.
- **Grammarly hydration warning**: a hydration mismatch in dev can come from the Grammarly browser extension adding attributes to `<body>`; it is not an app bug (`suppressHydrationWarning` is on `<body>` only). Test in a clean profile before chasing it.
- **PKCE links work only in the same browser** that asked for them (sign-up or password reset). Opening the email link elsewhere fails by design; automated tests use the token form, and the real-inbox check is manual.
- **`redirect()` in a Server Action rejects the client promise with `NEXT_REDIRECT`**; a `catch` that shows an error swallows a success. Rethrow when `digest` starts with `NEXT_REDIRECT`.
- **Time zones**: slot rules live in `src/lib/time` and in `submit_booking`; they must agree on clock-change days (test T10). Never use host-time-zone date arithmetic.
- **Parallel Playwright workers** share files and ports: use unique folders per test, and the UI port is configurable with `UI_TEST_PORT`. `reuseExistingServer` can hide a stale server.
- **Worktrees**: parallel agents get their own git worktree and branch; only one agent edits a given checkout at a time.
- **Windows**: PowerShell has no `&&` in Windows PowerShell 5.1; use `;` or separate commands. Quote paths with spaces.
