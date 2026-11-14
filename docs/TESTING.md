# SlotMate — Testing

Last updated: 2026-11-14 · Phase 5 · Sources: `docs/DATABASE.md` section 10, `tests/db/`

This document says how SlotMate is tested, how to run the tests, what has been proved so far and what has not. The test *design* (what each test must prove) is in `docs/DATABASE.md` section 10; this document tracks the status.

**Status in one line:** 9 of the 21 designed tests (T1–T8 and T19) are implemented, as 19 Playwright test cases, and all pass against the development Supabase project (run on 2026-11-14: 19 passed in 44 seconds; a read-only check afterwards found no test data left behind). The other tests are planned. No user-interface tests exist yet.

---

## 1. How to run the database tests

You need:

- Node.js 20.12 or newer (the test configuration uses Node's built-in `process.loadEnvFile`).
- `npm install` done.
- A **development** Supabase project that has migrations 1–7 applied (`npx supabase db push --remote`) and that the CLI is linked to (`npx supabase link --project-ref <your-project-ref>`). Tests T6 and T7 run read-only SQL through the CLI, which needs you to be logged in (`npx supabase login`).
- `.env.local` with `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and `SUPABASE_SECRET_KEY` (names only here; see `docs/ARCHITECTURE.md` section 7 and `.env.example`).

Run (Windows PowerShell, from the project folder):

```powershell
npm run test:db
```

This runs `playwright test tests/db`. No browser is started and **no browser download is needed** (do not run `npx playwright install` for these tests). To run one file:

```powershell
npx playwright test tests/db/t08-parallel-booking.spec.ts
```

**Warning:** these tests create and delete real Auth users and rows in whatever Supabase project `.env.local` points to. Use a development project, never a production one. (The Supabase CLI output labels our development project's environment "production". That label comes from Supabase, not from how we use the project.)

Other checks to run together with the tests (all three before saying something works):

```powershell
npm run test:db
npx tsc --noEmit
npx eslint
```

## 2. The rule: real paths only

Every database test uses a path that real code will use. Nothing else is allowed (owner decision Q4):

- **Our server** is `service_role`: supabase-js with the secret key, calling the real database functions (`submit_booking` and so on).
- **An owner** is a really logged-in user: the publishable key plus `signInWithPassword`, so row level security applies exactly as in the product.
- **A visitor or stranger** is `anon`: the publishable key and no login.
- **No direct Postgres connection** (apart from the two read-only catalog audits T6 and T7, below), and **no extra grants** added to make a test pass.

Why: a test that connects as the database owner, or that gets extra rights, can pass while the real product is broken (or fail for a reason that cannot happen in the product). The aim is to prove what a real caller can and cannot do. It also means the tests build data the way the product does: owners create their own workspaces and resources through RLS, and bookings only ever come from `submit_booking`.

The two catalog audits (T6 and T7) are the one place that reads system tables. They do it read-only with `npx supabase db query --remote --read-only`, which runs in a read-only transaction.

## 3. The tests (T1–T21)

T1 to T21 are defined in `docs/DATABASE.md` section 10. Status as of 2026-11-14:

**Passing (implemented in `tests/db/`):**

- **T1 — Owner isolation** (`t01-isolation.spec.ts`, 6 tests). Owner A cannot read, update or delete B's rows in the owner-data tables (workspaces, resources, availability, bookings, embed settings, usage, subscription, profile), cannot create workspaces or resources for B, and cannot insert bookings; B's data is unchanged afterwards. Positive control: A sees exactly A's own rows.
- **T2 — `submit_booking` is closed to browser roles** (`t02-rpc-permissions.spec.ts`, 2 tests). `anon` and a logged-in owner are refused; no booking is created and no usage is counted. Positive control: the same arguments work for `service_role`.
- **T3 — Closed tables** (`t03-closed-tables.spec.ts`, 3 tests). `rate_limit_attempts`, `stripe_events` and (for anon) `subscriptions` cannot be read. Positive control: an owner can read their own subscription.
- **T4 — Anonymous writes** (`t04-anon-writes.spec.ts`, 2 tests). Every insert, update and delete as `anon` on `subscriptions`, `rate_limit_attempts`, `stripe_events`, `monthly_usage` and `bookings` is refused, and values and counts are unchanged.
- **T5 — The subscription is read-only for owners** (`t05-subscription-readonly.spec.ts`, 1 test). An owner cannot set their plan to Pro, change the status, insert a second row or delete the row; the plan stays Free.
- **T6 — Function permissions audit** (`t06-function-audit.spec.ts`, 1 test). No function in `public` is executable by `PUBLIC`, `anon` or `authenticated`; all have a fixed `search_path`; `service_role` can execute exactly the eight server-only functions.
- **T7 — RLS audit** (`t07-rls-audit.spec.ts`, 2 tests). All 11 tables in `public` have RLS enabled; no policy is granted to `anon` or `PUBLIC`.
- **T8 — Parallel booking** (`t08-parallel-booking.spec.ts`, 1 test). 20 rounds of 3 simultaneous `submit_booking` calls for one slot: exactly one winner per round, every loser gets `slot_taken`, and the owner's monthly count rises by exactly 1 per round.
- **T19 — Sign-up trigger** (`t19-signup-trigger.spec.ts`, 1 test). Creating a user creates exactly one profile and one Free subscription; deleting the user removes the subscription row (through the cascade from the profile; our server cannot read `profiles`, so the profile's removal is implied, not asserted).

**Planned.** The phase in brackets is a proposal for when each test will be written (alongside the feature it checks); change it if the order of phases changes. Every test is re-run in Phase 17.

- **T9 — Overlap rule through real paths** (Phase 11, public booking).
- **T10 — Invalid slots refused by the function**, including the clock-change cases: both copies of the repeated hour, slots that end in it, the skipped hour, for several time zones (Phase 10, availability and the time library).
- **T11 — Monthly limit** (Phase 11).
- **T12 — Plan-limit race** for workspaces and resources, including direct inserts by an owner (Phase 9, after both exist).
- **T13 — Status changes** (Phase 12, booking management).
- **T14 — Rate limit** (Phase 11).
- **T15 — Webhook memory** (Phase 15, Stripe billing).
- **T16 — Downgrade lock and selection** (Phase 15).
- **T17 — Cascades** (Phase 9).
- **T18 — `src/lib/plans.ts` matches `plan_limits`** (Phase 8, when `plans.ts` is created).
- **T20 — Time zone validation** (Phase 8, workspaces).
- **T21 — Image upload path**, including the `set_resource_image` path rules and the lock check (Phase 9, resources).

## 4. Test data and cleanup rules

- Test owners are created with `auth.admin.createUser` (email already confirmed, so no email is sent), with a random address `slotmate-test-<random>@example.com` and a random password of at least 8 characters.
- Each test file deletes the users it created in `afterAll`. Deleting an Auth user cascades to the profile, subscription, workspaces, resources, availability, bookings, embed settings and usage.
- A global teardown runs once at the end and deletes any leftover user whose address matches that pattern, so a crashed run does not leave data behind.
- Tests only create and delete accounts with that test address pattern; the global teardown deletes only addresses that match it, so real accounts are never touched. Even so, run the tests only against a development project.
- Check afterwards (read-only): `select count(*) from auth.users` should be 0 in a development project that has no real accounts. On 2026-11-14 the count was 0 for `auth.users` and for every table the tests use.
- No test prints, logs or snapshots an environment variable or key. Output contains test names and assertion messages only.
- Booking times are always a future day (5 days ahead) in a workspace whose time zone is `UTC`, with opening hours 00:00–24:00 on all seven weekdays, so every whole hour is a valid slot.
- Playwright's scratch output goes to the system temp folder; `test-results/` and `playwright-report/` are also ignored by Git.

## 5. Known limits of the current tests

- **T8 uses 3 concurrent requests per round.** That proves the rule but is a mild load. Phase 17 should raise it to about 10.
- **T2** accepts either `42501` (permission denied) or `PGRST202` (function not visible to the role). Both mean "cannot call it"; the test does not say which one the API returns.
- **T3** accepts "permission denied or no rows", as written in the design.
- **T4**: the row counts of `rate_limit_attempts` and `stripe_events` cannot be read through a real path (`service_role` has no privilege on them either), so for those two tables the refused statement itself is the proof.
- **T6** hard-codes the list of eight server-only functions. Adding a function means updating the test, on purpose.
- Tests run one file at a time (one worker), against a real remote project, over the network. They are not yet part of an automatic pipeline.
- Not covered yet: everything in the planned list above, the behaviour of the dashboard and public pages, and the real sign-up form with email confirmation.
- Time and clock changes are not yet tested against the live database (T10).

## 6. Later: user-interface tests

When the interface exists (Phase 6 onwards), browser tests will check the layout at three widths, matching RESP-01 and RESP-02:

- **375 px** (phone)
- **768 px** (tablet)
- **1280 px** (desktop)

The public booking page and the widget must work fully at 375 px. Those tests will live under `tests/` next to `tests/db/` and need a browser download (`npx playwright install`), which is deliberately not needed for the database tests.

## 7. Change history

- **2026-11-14** — Created (Phase 5). Documents the database tests T1–T8 and T19, which were written and run on this date.
