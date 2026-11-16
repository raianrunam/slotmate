# SlotMate — Submission checklist

Last updated 2026-11-16. Status words: **done** (finished and checked), **pending** (not yet done, owner to do), **partly** (see the note).

Repository: https://github.com/raianrunam/slotmate · Live site: https://slotmate-lac.vercel.app (Stripe test mode only).

## 1. Course deliverables

| # | Deliverable | Status | Link and note |
|---|---|---|---|
| 1 | Public GitHub repository | done | https://github.com/raianrunam/slotmate. The repository is public; the whole Git history was scanned for secrets in Phase 17b with no real secret found ([`REQUIREMENTS_CHECKLIST.md`](REQUIREMENTS_CHECKLIST.md) SEC-01). |
| 2 | Complete README | done | [`../README.md`](../README.md): live address, features, tech stack, screenshots, how to run locally, test commands with counts, links to every document, demo-video placeholder, "Built with Claude Code". The demo-video link inside it is a placeholder until row 5 is done. |
| 3 | Database documentation | done | [`DATABASE.md`](DATABASE.md) (tables, rules, functions, row level security, migrations, with an entity diagram) and the 8 migrations in [`../supabase/migrations/`](../supabase/migrations/). Companion: [`ARCHITECTURE.md`](ARCHITECTURE.md). The Mermaid diagrams are being checked on GitHub by the owner (section 3 below). |
| 4 | Screenshots | done | [`screenshots/`](screenshots/) (12 images), shown in the README: the live landing page (desktop and phone, taken after the final fix), the public booking page, the booking status page (pending and approved), dashboard, bookings, analytics, widget settings with preview, the embedded widget and billing. All were looked at before they were added; none shows a real address, key or project reference. |
| 5 | Demo video | **pending** | Not recorded yet. Script: [`DEMO_SCRIPT.md`](DEMO_SCRIPT.md). When recorded, put the link here and in the README "Demo video" section. Video link: _to be added_. |
| 6 | Reflection | **pending** | To be written by the owner in `docs/REFLECTION.md` (the file does not exist yet). The honest material to draw on is [`DEVELOPMENT_LOG.md`](DEVELOPMENT_LOG.md) ("Agent mistakes and how they were caught"). |
| 7 | Requirement checklist | done | [`REQUIREMENTS_CHECKLIST.md`](REQUIREMENTS_CHECKLIST.md): 85 requirements, 82 done, 3 partly (EMBED-06, PERF-01, PERF-02), none missing; all 74 Must-haves done. Every requirement has its evidence (test titles or a manual check with owner and date). |
| 8 | At least two agentic techniques | done | Nine used (section 2 below), all with evidence in [`AGENTIC_TOOLS.md`](AGENTIC_TOOLS.md). |
| 9 | At least one parallel development task | done | Phases 13 and 14 were built at the same time by two subagents in two git worktrees (section 2, row 7). |
| 10 | Live deployment | done | https://slotmate-lac.vercel.app, on Vercel with a separate production Supabase project. Setup, checks and what went differently: [`DEPLOYMENT.md`](DEPLOYMENT.md). The owner checked sign-up, login, a booking, a test payment and the cookie flags on production on 2026-11-16. |

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
| 9 | Playwright MCP server | [`../.mcp.json`](../.mcp.json) | `AGENTIC_TOOLS.md` section 9. It could not connect in the session that created it (recorded honestly); the visual check was done by a test that saved screenshots instead. |
| - | OpenSpec | not used | Skipped on purpose, reason in `AGENTIC_TOOLS.md` section 10. |

## 3. Checks the owner is doing by hand

| Check | Status | How |
|---|---|---|
| Mermaid diagrams render on GitHub | **pending (owner)** | Open https://github.com/raianrunam/slotmate/blob/main/docs/DATABASE.md (1 entity diagram, near the top) and https://github.com/raianrunam/slotmate/blob/main/docs/ARCHITECTURE.md (4 diagrams). If one shows an error instead of a picture, tell the agent which one. |
| README images show | **pending (owner)** | Open https://github.com/raianrunam/slotmate and scroll to "Screenshots". |

## 4. Open items to know about

- **Demo video and reflection** are the two pending deliverables (rows 5 and 6).
- **Landing page leftovers: fixed (2026-11-16, commit `9857cd1`).** The owner found a "Placeholder" notice, "Paid plans are not available yet" and a fake-clickable example card on the live landing page during the final review. The notice and the `/design` page are gone, the example is a labelled figure, and tests guard against it coming back (`tests/unit/no-leftovers.spec.ts`, `tests/ui/no-leftovers.spec.ts`).
- **PERF-01** stays "partly": the dashboard and booking list were not timed on production.
- **`npm audit`** reports 12 findings, all in development tooling, none in the deployed app; the owner decides (`DEVELOPMENT_LOG.md`, Phase 17b).
- Other known limits, each with where it is described: [`REQUIREMENTS_CHECKLIST.md`](REQUIREMENTS_CHECKLIST.md) section 5.
