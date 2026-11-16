# SlotMate — Submission checklist

Last updated 2026-11-16 (final). Status words: **done** (finished and checked), **not included** (decided not to deliver, with the reason), **owner to confirm** (something only the owner can look at).

Repository: https://github.com/raianrunam/slotmate (public; the owner checked it in a private browser window) · Live site: https://slotmate-lac.vercel.app (Stripe test mode only: card `4242 4242 4242 4242`, any future date, any security code, no real money).

## 1. Course deliverables

| # | Deliverable | Status | Link and note |
|---|---|---|---|
| 1 | Public GitHub repository | done | https://github.com/raianrunam/slotmate. The whole Git history was scanned for secrets in Phase 17b with no real secret found ([`REQUIREMENTS_CHECKLIST.md`](REQUIREMENTS_CHECKLIST.md) SEC-01). |
| 2 | Complete README | done | [`../README.md`](../README.md): live address, features, features done and not done (table), tech stack, screenshots, how to run the project (setup and test commands), agentic tools used and where, links to every document. |
| 3 | Database documentation | done | [`DATABASE.md`](DATABASE.md) (tables, rules, functions, row level security, migrations, with an entity diagram) and the 8 migrations in [`../supabase/migrations/`](../supabase/migrations/). Companion: [`ARCHITECTURE.md`](ARCHITECTURE.md). |
| 4 | Screenshots | done | [`screenshots/`](screenshots/) (12 images), shown in the README: the live landing page (desktop and phone), the public booking page (phone and desktop), the booking status page (pending and approved), dashboard, bookings, analytics, widget settings with preview, the embedded widget and billing. All were looked at before they were added; none shows a real address, key or project reference. |
| 5 | Demo video | **not included** | Decision (owner, 2026-11-16): screenshots instead of a video, because the submission system accepts only file uploads. The script that would have been used is kept: [`DEMO_SCRIPT.md`](DEMO_SCRIPT.md). |
| 6 | Reflection | done | [`REFLECTION.md`](REFLECTION.md), written by the owner and saved unchanged. |
| 7 | Requirement checklist | done | [`REQUIREMENTS_CHECKLIST.md`](REQUIREMENTS_CHECKLIST.md): 85 requirements, 82 done, 3 partly (EMBED-06, PERF-01, PERF-02), none missing; all 74 Must-haves done. Every requirement has its evidence (test titles or a manual check with owner and date). |
| 8 | At least two agentic techniques | done | Nine used (section 2 below), all with evidence in [`AGENTIC_TOOLS.md`](AGENTIC_TOOLS.md). |
| 9 | At least one parallel development task | done | Phases 13 and 14 were built at the same time by two subagents in two git worktrees (section 2, row 7). |
| 10 | Live deployment | done | https://slotmate-lac.vercel.app, on Vercel with a separate production Supabase project. Setup, checks and what went differently: [`DEPLOYMENT.md`](DEPLOYMENT.md). The owner checked sign-up, login, a booking, a test payment and the cookie flags on production on 2026-11-16, and found the leftover landing-page text in the final review (fixed). |
| 11 | Files for the upload-only submission system (max 2 MB per file, max 20 files) | done | Two PDFs made from the README, the reflection and the screenshots, kept in the owner's notes folder (outside the repository, because they carry the owner's name and student number): the main submission PDF (title page with the links and the Stripe test card, how to run, features done and not done, agentic tools, the reflection) and the screenshots PDF(s). Exact sizes: [`DEVELOPMENT_LOG.md`](DEVELOPMENT_LOG.md), Phase 18 part 4. |

## 2. Agentic techniques, with evidence

Full detail, dates and proof for each: [`AGENTIC_TOOLS.md`](AGENTIC_TOOLS.md).

| # | Technique | Where it lives | Evidence |
|---|---|---|---|
| 1 | Project rules for agents | [`../AGENTS.md`](../AGENTS.md), [`../CLAUDE.md`](../CLAUDE.md) | `AGENTIC_TOOLS.md` section 1; the rules were followed through all phases (for example "never edit a pushed migration", "no `git add -A`"). |
| 2 | Permission deny rules for secrets | [`../.claude/settings.json`](../.claude/settings.json) | `AGENTIC_TOOLS.md` section 2; the block worked in practice and is recorded as a friction point in `DEVELOPMENT_LOG.md` (Phase 5). |
| 3 | Hooks | [`../.claude/hooks/`](../.claude/hooks/) | `AGENTIC_TOOLS.md` section 3; 56 unit checks in [`../tests/unit/hooks.spec.ts`](../tests/unit/hooks.spec.ts) run each hook as a real process; live demo and the hook blocking the agent's own commands recorded in `DEVELOPMENT_LOG.md` (Phase 16). |
| 4 | Custom subagents (`security-reviewer`, `migration-reviewer`, `test-runner`) | [`../.claude/agents/`](../.claude/agents/) | `AGENTIC_TOOLS.md` section 4; the `test-runner` produced the Phase 17b final counts (`DEVELOPMENT_LOG.md`, Phase 17b). |
| 5 | Project skill `slotmate-phase` | [`../.claude/skills/slotmate-phase/`](../.claude/skills/slotmate-phase/) | `AGENTIC_TOOLS.md` section 5. |
| 6 | Independent reviewer subagents | review reports kept in the owner's notes folder | `AGENTIC_TOOLS.md` section 6; the findings and fixes of each review are in `DEVELOPMENT_LOG.md` (for example the Phase 16 whole-app security review and the Phase 17 re-review). |
| 7 | **Parallel worktrees** | two worktrees and branches, merged into `main` | `AGENTIC_TOOLS.md` section 7 and `DEVELOPMENT_LOG.md` "Parallel development evidence": `feat/phase13-analytics` and `feat/phase14-widget` from the same commit, launched together, ran at the same time for about seven minutes, merged without a conflict (merge commits `baae8aa` and `9c53394`). |
| 8 | Playwright as the test runner | [`../tests/`](../tests/) | `AGENTIC_TOOLS.md` section 8; [`TESTING.md`](TESTING.md); 435 unit and 400 UI tests (final run, 2026-11-16) and 94 database tests (Phase 17b) on the last full run. |
| 9 | Playwright MCP server | [`../.mcp.json`](../.mcp.json) | `AGENTIC_TOOLS.md` section 9. It could not connect in the session that created it (recorded honestly); on 2026-11-16 it was used to check the live site and take the landing-page screenshots. |
| - | OpenSpec | not used | Skipped on purpose, reason in `AGENTIC_TOOLS.md` section 10. |

## 3. Left for the owner to look at

| Check | Status | How |
|---|---|---|
| Mermaid diagrams render on GitHub | **owner to confirm** (the result was not reported back) | Open https://github.com/raianrunam/slotmate/blob/main/docs/DATABASE.md (1 entity diagram, near the top) and https://github.com/raianrunam/slotmate/blob/main/docs/ARCHITECTURE.md (4 diagrams). A diagram that shows an error instead of a picture needs a syntax fix. |

## 4. Open items to know about

- **PERF-01** stays "partly": the dashboard and booking list were not timed on production. **EMBED-06** stays "partly": the widget preview shows the saved options. **PERF-02** stays "partly": no 1,000-booking test.
- **`npm audit`** reports 12 findings, all in development tooling, none in the deployed app; the owner decides (`DEVELOPMENT_LOG.md`, Phase 17b).
- **Found late, by hand:** the owner found leftover placeholder text and fake-clickable buttons on the live landing page in the final review; they were fixed (commit `9857cd1`) and tests now guard against it (`tests/unit/no-leftovers.spec.ts`, `tests/ui/no-leftovers.spec.ts`).
- Other known limits, each with where it is described: [`REQUIREMENTS_CHECKLIST.md`](REQUIREMENTS_CHECKLIST.md) section 5.
