# SlotMate — Testing

Last updated: 2026-11-15 · Phase 11 · Sources: `docs/DATABASE.md` section 10, `tests/db/`

This document says how SlotMate is tested, how to run the tests, what has been proved so far and what has not. The test *design* (what each test must prove) is in `docs/DATABASE.md` section 10; this document tracks the status.

**Status in one line:** 20 of the 21 designed tests are implemented in whole or in part (T1–T8 and T19 from Phases 4–5; T12, T16 part 1, T17 part 1 and T20 from Phase 8; T12 resources part, T17 part 2, T18 and T21 from Phase 9; T10 from Phase 10; T9, T11 and T14 from Phase 11), as 66 database test cases (65 pass, 1 is skipped on purpose, see T14), 238 unit checks and 193 UI checks, run against the development Supabase project on 2026-11-15. Both global teardowns also check that no test user and no test file is left (section 4). The rest are planned. Unit checks (`npm run test:unit`) and user-interface checks (`npm run test:ui`) also exist (sections 6, 6a and 6b).

---

## 1. How to run the database tests

You need:

- Node.js 22 or newer (shadcn/ui's `cn` helper needs Node 22; the database test configuration also uses Node's built-in `process.loadEnvFile`).
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
- **T8 — Parallel booking** (`t08-parallel-booking.spec.ts`, 1 test). 20 rounds of 10 simultaneous (raised from 3 in Phase 11) `submit_booking` calls for one slot: exactly one winner per round, every loser gets `slot_taken`, and the owner's monthly count rises by exactly 1 per round.
- **T19 — Sign-up trigger** (`t19-signup-trigger.spec.ts`, 1 test). Creating a user creates exactly one profile and one Free subscription; deleting the user removes the subscription row (through the cascade from the profile; our server cannot read `profiles`, so the profile's removal is implied, not asserted).
- **T12 — Plan-limit race, workspaces part** (`t12-workspace-limit-race.spec.ts`, 1 test; Phase 8). One Free owner fires 10 workspace creates at the same instant through their own login: exactly 1 succeeds, the other 9 get `workspace_limit_reached`, and exactly one workspace exists afterwards. A create cancelled by a deadlock (40P01) is retried once, as the app does (Q10).
- **T16 part 1 — Downgrade locks workspaces** (`t16-lock-workspaces.spec.ts`, 1 test; Phase 8). The plan is changed the way the Stripe webhook changes it (`service_role` UPDATE on `subscriptions`, with a `stripe_subscription_id` for Pro). Pro, two workspaces, back to Free: both are locked (nothing deleted, nothing chosen automatically). An owner UPDATE on a locked workspace changes nothing. The owner deletes one: the reconcile unlocks the other, which is editable again.
- **T17 part 1 — Workspace delete cascade** (`t17-workspace-cascade.spec.ts`, 1 test; Phase 8). The owner deletes a workspace through their own login: the embed row, the resources, the opening hours and the bookings are gone (each is checked to exist first), and the monthly usage count stays (D19).
- **T20 — Time zone** (`t20-time-zone.spec.ts`, 3 tests; Phase 8). An invalid zone name (`Mars/Olympus`, a typo, empty, `UTC+2`) is refused with `invalid_time_zone` on update and on insert, and a missing zone is refused (no default, DB10). Changing a workspace's zone to Tokyo, New York and Auckland keeps a booking's `starts_at` and `ends_at` exactly the same (A11).
- **T12 — Plan-limit race, resources part** (`t12b-resource-limit-race.spec.ts`, 1 test; Phase 9). One Free owner fires 10 resource creates at the same instant straight through their own login: exactly 3 succeed (the Free limit), the other 7 get `resource_limit_reached`, and exactly 3 resources exist.
- **T17 part 2 — Resource delete cascade** (`t17b-resource-cascade.spec.ts`, 2 tests; Phase 9). The owner deletes one resource: its opening hours and bookings are gone (each checked to exist first), the workspace stays, the monthly usage stays (D19). Another owner's resource cannot be deleted. The removal of the Storage files is proved through the app in the UI tests (section 6c).
- **T18 — Plans match the database** (`t18-plans-match.spec.ts`, 2 tests; Phase 9). `PLAN_LIMITS` in `src/lib/plans.ts` equals the `plan_limits` table for every plan and number, and the app's Pro rule `effectivePlan` gives the same answer as the database function `current_plan` for seven subscription states.
- **T21 — Image path and bucket** (`t21-image-path.spec.ts`, 8 tests; Phase 9). `set_resource_image`: a good path is recorded and NULL removes it; a foreign owner and unknown ids are refused (`resource_not_found`); paths outside `<owner>/<resource>/`, with `..`, with no file name, or empty are refused (`invalid_path`); a locked resource refuses a new path and NULL (`resource_locked`) and keeps its image. The bucket: the server key can write and the file is publicly readable by address; `anon` cannot upload, replace, delete or list; a logged-in owner cannot upload or list; the bucket itself refuses text, SVG and files over 2 MiB even from the server key. The test files are removed at the end.
- **T10 — The app's slot rules equal `submit_booking`** (`t10-slots-agree.spec.ts`, 15 tests; Phase 10). A Pro test owner has five workspaces (London, New York, Sydney, Pacific/Kiritimati +14, Pacific/Pago_Pago −11) and 20 resources (30, 45, 60 and 90 minute slots) with a different opening window on different weekdays. For every 15-minute start (plus misaligned ones) around the real 2026 clock changes, the app (`isBookableStart`) and the live database must give the same answer: accepted, `invalid_slot` (second copy of a repeated hour, a start in the skipped hour, misaligned, outside the hours, closed weekday), `past` or `too_far`. The database checks the slot before "past" and "too far", so a valid start on a past date answers `past`; that is how the real clock-change days are tested although none falls inside the next 90 days. On ordinary days (yesterday, 3, 90 and 91 days ahead, near local midnight, near closing time) accepted slots are really inserted and `ends_at` is compared, then deleted. Three more tests: clock changes inside the next 90 days (checked at run time; **there are none between mid-November and mid-February, so this test finds nothing to do today and passes without comparing**), PostgreSQL's resolution of a repeated and a skipped wall time (read-only SQL), and `ends_at` on every clock-change day for every slot length against a read-only SQL **copy** of step 5 of the function (a copy of the logic, not the function itself: if the function changes, the copy must change too). Where `ends_at` cannot be compared through a booking (past dates), these two tests are the evidence. Two deliberate mutations of the app code (using the second copy of a repeated hour; taking the weekday from the UTC date) were confirmed to make T10 fail. Known limits: 45-minute slots are not inserted on clocks-forward days (known limitation, DATABASE.md 7.2.1); start moments with sub-millisecond parts are not tested; the 90-day boundary can flake if the run crosses local midnight in Kiritimati (10:00 UTC).

- **T9 — Overlap rule through real paths** (`t09-overlap.spec.ts`, 5 tests; Phase 11). Our server books through `submit_booking`; a really logged-in owner changes statuses. Back-to-back bookings are allowed; the same slot twice is refused; after the owner changes the slot length to 90 minutes, bookings that overlap held ones **with a different start** are refused (`slot_taken`) and use no allowance; pending and approved hold a slot; rejected, cancelled and deleted bookings free it, and a freed slot can be taken only once; a rejected booking cannot be revived (`invalid_status_change`).
- **T11 — Monthly limit** (`t11-monthly-limit.spec.ts`, 2 tests; Phase 11). A Free owner gets 100 real submissions (10 at a time); the 101st is `limit_reached` and saves nothing; the owner deletes 10 bookings and the count stays 100 (D19); upgrading to Pro allows requests at once. A second owner at 98 sends 6 requests at once: exactly 2 succeed.
- **T14 — Rate limit** (`t14-rate-limit.spec.ts`, 5 tests + 1 skipped; Phase 11). Through `check_rate_limit`: 5 attempts allowed, the 6th and later refused (refused attempts count); another workspace and another visitor are unaffected; it never touches the monthly count; only a 32-byte hash is accepted (an IP address cannot be stored); `anon` and owners cannot call it. **Skipped: simultaneous attempts**, because a parallel burst can be allowed in full (known database weakness, DATABASE.md 7.4; fixing it needs a new migration). **Not testable through real paths:** the 10-minute window ending and the clean-up of old records (no role can change or read `rate_limit_attempts`).


**Planned.** The phase in brackets is a proposal for when each test will be written (alongside the feature it checks); change it if the order of phases changes. Every test is re-run in Phase 17.

- **T13 — Status changes** (Phase 12, booking management).
- **T15 — Webhook memory** (Phase 15, Stripe billing).
- **T16 part 2 — Downgrade lock and selection** for resources and `apply_downgrade_selection` (Phase 15). Part 1 is done (above).
- **T17 part 2, the account and Storage-image cases** (account delete). The workspace and resource cascades are done (above and in Phase 9).

## 4. Test data and cleanup rules

- Test owners are created with `auth.admin.createUser` (email already confirmed, so no email is sent), with a random address `slotmate-test-<random>@example.com` and a random password of at least 8 characters.
- Each test file deletes the users it created in `afterAll`. Deleting an Auth user cascades to the profile, subscription, workspaces, resources, availability, bookings, embed settings and usage.
- A global teardown runs once at the end and deletes any leftover user whose address matches that pattern, so a crashed run does not leave data behind.
- Tests only create and delete accounts with that test address pattern; the global teardown deletes only addresses that match it, so real accounts are never touched. Even so, run the tests only against a development project.
- Check afterwards (read-only): `select count(*) from auth.users` should be 0 in a development project that has no real accounts. On 2026-11-14 the count was 0 for `auth.users` and for every table the tests use.
- No test prints, logs or snapshots an environment variable or key. Output contains test names and assertion messages only.
- Booking times are always a future day (5 days ahead) in a workspace whose time zone is `UTC`, with opening hours 00:00–24:00 on all seven weekdays, so every whole hour is a valid slot.
- **No leftovers (Phase 10).** Both global teardowns delete leftover test users together with their Storage files (deleting a user does not delete their files), delete the bucket folders of every test user id recorded during the run (kept in a small file in the temp folder) and the `t21-*` folders, and then **fail the run** if any test user or any such file remains. They never delete folders that belong to anybody else.
- Playwright's scratch output goes to the system temp folder; `test-results/` and `playwright-report/` are also ignored by Git.

## 5. Known limits of the current tests

- **T8 uses 10 concurrent requests per round** (raised in Phase 11); Phase 17 may raise it further.
- **T14:** the burst case is skipped until the rate-limit weakness is fixed by a new migration; the window expiry cannot be tested without waiting 10 minutes and a privilege no role has.
- **T2** accepts either `42501` (permission denied) or `PGRST202` (function not visible to the role). Both mean "cannot call it"; the test does not say which one the API returns.
- **T3** accepts "permission denied or no rows", as written in the design.
- **T4**: the row counts of `rate_limit_attempts` and `stripe_events` cannot be read through a real path (`service_role` has no privilege on them either), so for those two tables the refused statement itself is the proof.
- **T6** hard-codes the list of eight server-only functions. Adding a function means updating the test, on purpose.
- Tests run one file at a time (one worker), against a real remote project, over the network. They are not yet part of an automatic pipeline.
- Not covered yet: everything in the planned list above, the behaviour of the dashboard and public pages, and the real sign-up form with email confirmation.
- Time and clock changes are not yet tested against the live database (T10).

## 6. User-interface tests (Phase 6)

Run: `npm run test:ui` (config: `playwright.ui.config.ts`, tests: `tests/ui/`). The first time, install the browser with `npx playwright install chromium`. The config builds the app and starts it on port 3100 (it refuses to reuse something already on that port). **Since Phase 7 it also needs `.env.local`** (the app needs its Supabase settings, and the tests create throw-away owners; see section 6a). The database tests (`npm run test:db`) are separate and unchanged.

Status on 2026-11-14: 88 checks pass. What they check:

- **Every shell page** (landing, the four auth screens, the dashboard and its seven sections, the public booking page, the status page, the widget, the `/design` reference page and the 404 page) at 375, 768 and 1280 px, plus seven pages in the dark theme at 375 and 1280 px. For each: the expected HTTP status; exactly one `h1`, exactly one `main` landmark and no skipped heading level; no console errors or warnings and no page errors; no horizontal scrolling; every control, link and button has an accessible name, and every `aria-labelledby` points at something real.
- **Interactions:** the skip link is hidden until focused and then visible and readable; a focus ring is drawn on a focused link; the theme menu shows the current choice and switches dark and light; the dashboard shows the sidebar from 1024 px and the menu button below that (768, 1023, 1024, 1280 px); the mobile menu opens, closes on navigation and on Escape and returns focus; the delete confirmation (Cancel and Escape, focus returns); a dialog keeps focus inside; the account menu works by keyboard; pagination shows 20 per page; the phone bookings list shows the time; the Free and Pro limits on the landing page are exactly 1/3/100 and 5/25/1000 with $9.99; the two plan buttons line up; form control borders are dark enough.
- **Screenshots** of every page and width are saved outside the repository, to `<home>/slotmate-notes/screenshots` (or the folder in the environment variable `SLOTMATE_SCREENSHOT_DIR`).

Known limits of the UI tests: there is no automatic contrast measurement or axe-core scan (that would be a new package, so contrast is checked from the colour tokens in review); the overflow check looks at the whole page, not at content clipped inside a scroll box; the booking, resource and analytics screens are still placeholders; real screen-reader behaviour is not tested.

### 6a. Authentication tests (Phase 7)

Status on 2026-11-15: 73 unit checks, 129 UI checks (88 from Phase 6 plus the new ones) and the 19 database tests pass.

**Rules.** Automated tests never send a real email (A20). Owners are made with `auth.admin.createUser` (email already confirmed, or not confirmed for one test), and email links are made with `auth.admin.generateLink`, which only returns the link. Every test address starts with `slotmate-test-` and ends with `@example.com`; a sweep at the end deletes any left behind. The only address that reaches Supabase's email system is a made-up one in the forgot-password test (it has no account, so nothing is sent), plus one sign-up for an address that already has an account (no email is sent for it).

**Unit tests** (`npm run test:unit`, `tests/unit/`): the zod rules (7 characters refused, 8 and 72 accepted, 73 refused, bad emails, trimming and lower-casing, matching passwords); `safeNext` against about 30 attack strings (`//evil.com`, `/\\evil.com`, encoded slashes, `javascript:`, newlines, `@`, `..`, lookalike prefixes, very long, non-strings); the email-link helpers (fixed destinations, unknown types refused); and source-code guards: every dashboard page contains `<OwnerGate` or `await requireOwner(`, no browser Supabase client exists, no `"use client"` file imports Supabase or a server-only module, the secret-key name never appears under `src/`, the only Route Handler is `/auth/confirm`, and logs contain only error codes.

**UI tests** (`tests/ui/auth.spec.ts`): logged-out visitors are redirected from every dashboard page to `/login?next=`; a made-up cookie does not open the dashboard; login with an admin-created owner shows the email in the header and survives a reload; the login cookies are `httpOnly`, `SameSite=Lax` and invisible to `document.cookie`; dashboard responses are `no-store`; login lands on the requested page; a wrong password and an unknown email give the identical message; an unconfirmed owner is told to confirm; log out ends the session (the dashboard redirects again and Back shows no dashboard); a logged-in owner is moved off `/login` and `/signup`; seven open-redirect attempts in `?next=` all land on `/dashboard`; a 7-character password and an invalid email are refused and no account is created; the forgot-password message is the same for an address that does not exist, and its marker cookie is `httpOnly`; sign-up for an existing address shows the same message; `/auth/confirm` with no parameters, an unknown type, a bad token, a bad PKCE code or an error from Supabase goes to `/login?error=link`, and the link cannot choose where to go; a recovery link (from `generateLink`) opens the reset form, short and mismatching passwords are refused, the new password works, the old one does not, and the used link is refused; `/reset-password` without a session is refused; an ordinary login session cannot use the reset form; resetting the password ends the owner's other browser session; a sign-up link confirms the account and opens the dashboard; and the security headers (no framing, `nosniff`, referrer policy) are on every page except `/embed/*`. The Phase 6 dashboard checks now run with the saved session of a test owner created once at the start (`tests/ui/global-setup.ts`), and `/reset-password` runs with that session plus the marker cookie.

**Bundle check** (`tests/ui/bundles.spec.ts`): after the production build, no file the browser can download (`.next/static`) contains the secret key's value (read from the environment, never printed; only file names are reported), the text `SUPABASE_SECRET_KEY`, `service_role` or `sb_secret_`, the server-only guard text, or Supabase's client code.

**Not automated, and why.** (1) The PKCE `?code=` link of a real email: it needs a code verifier created in a real browser by a real sign-up or reset request, which needs a real inbox and Supabase's limited email sending. The automated tests exercise the token form of the same landing route, and a bad PKCE code (rejected because the verifier is missing). One manual check by the project owner covers the real path (README, "Real-inbox check" steps in the final report of Phase 7). (2) Email scanners that open links before the owner does. (3) Timing differences between known and unknown addresses. (4) Supabase's own rate limits.

**Cleanup.** The UI run deletes its owners in `afterAll` and in a global teardown that also sweeps any `slotmate-test-` user. The leftover count was not checked separately by an extra script (it was blocked as an unauthorized use of the secret key); the sweep and the tests passing are the evidence.

### 6b. Workspace tests (Phase 8)

Status on 2026-11-15: 106 unit checks, 146 UI checks and 25 database tests pass.

**Unit** (`tests/unit/workspaces.spec.ts`): slug rules (valid and invalid examples, the live hint and the server rule agree), the slug suggestion, the zod schema, the time zone list (Asia/Kolkata and Europe/Kyiv accepted; offsets and junk refused), the database-error mapping (each known error becomes a fixed friendly message, raw database text never appears), the one deadlock retry, the app's Pro rule (`effectivePlan`), and source guards (every action calls `requireOwner()` first, no secret key, the delete button only submits through the confirmation dialog).

**UI** (`tests/ui/workspaces.spec.ts`, each test with its own throw-away owner logged in through the real login form): create (suggested address and browser zone), empty name, invalid address (live hint and server refusal), missing and unknown time zone, an address taken by ANOTHER owner, limit reached on Free (disabled create, upgrade prompt, and a second create from a form opened earlier), edit, empty name on edit, the time zone change warning, another owner's workspace is "not found", delete with Cancel, Escape and confirm, locked workspaces (labelled, read-only, delete allowed, the rest unlocks), a save on a workspace that locked after the form was opened, the overview count, logged-out redirects, and the two regression tests from the review (Asia/Kolkata, a page number past the end).

**Not covered:** a forged `owner_id` or `is_locked` sent straight to the Server Action (the database refuses them; T1 covers the database side), editing to a taken address, 21+ workspaces (the plans allow at most 5, so the 20-per-page rule cannot be reached yet), screen-reader behaviour.

### 6c. Resource tests (Phase 9)

Status on 2026-11-15: 144 unit checks, 171 UI checks and 38 database tests pass.

**Unit** (`tests/unit/resources.spec.ts`): the resource schema (slot length and capacity: zero, negative, decimal, text, exponent, too large all refused; the edges 5, 1440, 1, 1000 accepted); image validation (JPG, PNG and WebP recognised from the first bytes; text, HTML, SVG, GIF, a RIFF that is not WebP and a truncated PNG refused; exactly 2 MB passes, one byte more is refused; stored paths are `<owner>/<resource>/<random>.<ext>` and reject bad ids); the database-error mapping; and source guards (every action calls `requireOwner()` first, image actions look the resource up and check the lock before any Storage call, the upload checks size and signature before uploading, deletes remove Storage files before rows for resources and for workspaces, the stored name is server-made). `tests/unit/architecture.spec.ts` now says: the secret-key name appears only in `src/lib/supabase/admin.ts`, which is server-only, and only `src/features/resources/images.ts` imports it; no client file imports either.

**UI** (`tests/ui/resources.spec.ts`, each test with its own owner): create (workspace choice, usage "0 of 3 resources"), bad name, slot length and capacity values, edit including the availability switch, delete with Cancel, Escape and confirm, the workspace page listing its resources and the links both ways, the 4th resource on Free (disabled create, upgrade prompt, and a create from a form opened earlier), the account-wide count, image upload (the picture really loads from the public address), replace (the old file is deleted from the bucket), remove, a file over 2 MB (the browser guard), a text file renamed .png and HTML/SVG files with image names (refused by the server, nothing stored), submitting no file, deleting a resource and a workspace deletes the image files (DB15), locked resources (labelled, read-only, image kept, no image buttons, delete allowed and removes the file), an upload for a resource that locked while the form was open, and the forged-id tests (another owner's resource id and forged `owner_id`, `workspace_id`, `is_locked`, `image_path` on update, delete, upload and remove; the victim's rows and image file are checked afterwards). `tests/ui/workspaces.spec.ts` got the same forged-id tests for `updateWorkspace` and `deleteWorkspace` (Phase 8 carry-over). `tests/ui/owners.ts` holds the shared helpers: owners log in with their real session cookie (one password sign-in per owner, because Supabase limits sign-ins; the real login form is tested in `auth.spec.ts`), and cleanup also deletes every file the owner left in the bucket, because deleting a user does not delete Storage files.

**Not covered:** the server's own 2 MB check through the browser (the browser form refuses first; the check is proved by the unit tests), a request over 3 MB (Next.js answers 413 before our code runs), a failing Storage service, concurrent replace or delete of the same image, JPEG and WebP uploads through the UI (the signature check is unit tested; the UI uses PNG), an unlocked resource inside a locked workspace, and screen-reader behaviour.

### 6d. Availability tests (Phase 10)

Status on 2026-11-15: 209 unit checks, 189 UI checks and 53 database tests pass.

**Unit** (`tests/unit/slots.spec.ts`, 55 checks): clock text; calendar-date arithmetic independent of the host's time zone; slots for a normal day (09:00-12:00 gives 09:00, 10:00, 11:00; a leftover shorter than a slot is dropped; 30, 45, 60 and 90 minutes; closed weekdays; 00:00 and 24:00; bad windows); past (a slot that starts exactly now is not offered) and the 90-day limit counted in the workspace's zone (day 90 yes, day 91 no, Dhaka and London differ by a day near midnight); the clock-change days of Europe/London, America/New_York and Australia/Sydney (the skipped hour gives no slot, the repeated hour is offered once as its first copy, ends use the first copy, 23 and 24 hourly slots on short and long days); Asia/Dhaka with no changes; wall time to instants; and for 7 zones and dates times 4 slot lengths, every 5 minutes across 40 real hours, `isBookableStart` agrees with `slotsForDay` and with the reasons. `tests/unit/availability.spec.ts`: the weekly form rules (24:00 only as a closing time, closing later than opening, unreadable times, errors for every bad day at once) and source guards (the action calls `requireOwner()` first, the lock check comes before every write, no secret key, only the 21 allowed fields).

**UI** (`tests/ui/availability.spec.ts`, 13 tests): saving hours through the form and reading the database rows; update and close days; all days closed; 24:00 and the preview up to midnight; closing at or before opening (message on the day, nothing saved); unreadable times (one bad day stops the whole save); the 7-day preview names the workspace zone and shows slots or "Closed"; a locked resource shows the hours read-only; a save for a resource that locked while the form was open is refused; another owner's resource page is not found and a save with a foreign id and forged fields changes nothing; navigation from the dashboard menu and from the resource page; logged-out redirects. To stay under Supabase's sign-in rate limit, these tests share one Pro owner per worker (each test still has its own resource).

**Rate limit note.** Supabase limits password sign-ins. The whole UI suite now makes about 190 sign-ins; if a run reports "Request rate limit reached", wait a few minutes and run again (the helper retries a few times).

### Breakpoints for later UI tests

When features are built (Phase 7 onwards), their tests check the layout at three widths, matching RESP-01 and RESP-02:

- **375 px** (phone)
- **768 px** (tablet)
- **1280 px** (desktop)

The public booking page and the widget must work fully at 375 px. Those tests live in `tests/ui/` next to `tests/db/`. They need the Chromium download; the database tests deliberately do not.

### 6d. Public booking tests (Phase 11)

`tests/ui/booking.spec.ts` (13 tests) and `tests/unit/public-booking.spec.ts`. Visitors are browsers with no login, each with its own made-up `x-forwarded-for` address; owners are real API sessions; every test builds its own workspace under a shared Pro owner and deletes it, so the rate limit (5 per 10 minutes per visitor per workspace) never crosses between tests.

- **Full flow on a phone (375) and a desktop (1280):** main content within 3 s (D21); zone named; an empty form gives messages and focus on the first problem; more people than the capacity is refused next to the field; the booking is saved as `pending` with the **hash** of the code (never the code) and the right phone, note and attendees; the success message and the copy button (the clipboard really holds the link); the link panel is gone after a refresh; a refresh makes no second booking; the owner approves, then cancels, and the status page follows; a deleted booking shows "not found". A tablet (768) check covers fit, headings and labels.
- **Status page:** `Cache-Control: no-store`, `Referrer-Policy: no-referrer`, `X-Robots-Tag`, meta robots and referrer; a wrong code, a one-character-off code, extra characters and junk all show "Page not found".
- **What is on the public page:** missing and malformed addresses and locked workspaces (after a downgrade) show "Page not found" and the database also refuses to book them; unavailable resources are not in the HTML; a workspace with none shows a friendly message; the date picker allows only today to 90 days ahead; today shows only times after now. **Privacy:** after visitor A books, visitor B's page HTML and every server answer hold none of A's name, email, phone or note and no owner email or id, and A's time is not offered. (The fixture has no image: with an image the owner's id appears in the image address, see ARCHITECTURE change history, Phase 11.)
- **Races and limits:** two real browsers send the same time together, three rounds: exactly one booking each time, the other browser is told "just taken" and its list is refreshed; the 6th request in 10 minutes is refused and creates nothing, refused attempts keep being refused, another workspace is unaffected; an owner at the monthly limit shows "not accepting" and no form, and deleting bookings does not change that (D19); going Back after a success shows no false error.
- **Known limits:** a forged request (for example 4 people for a capacity of 3) cannot be sent through the form, because the browser runs the same rules first; the server side is covered by unit tests of the same schema, a source check of the action's order, and T8/T9 for the database rules. A missing or locked workspace answers with HTTP status 200 and the "Page not found" page (Cache Components streams the page first), so tests check the page, not the status code. The two-browser race is a behaviour check, not proof that the requests overlapped in time. Real phone and screen-reader behaviour is manual.


## 7. Change history

- **2026-11-15 (Phase 10)** — Added T10, section 6d, the permanent no-leftovers check, and the rate-limit note.

- **2026-11-15 (Phase 9)** — Added T12 (resources part), T17 part 2, T18 and T21, section 6c, the forged-id tests for Phase 8, and the rule that UI test owners log in with their session cookie and clean up their Storage files.

- **2026-11-15 (Phase 8)** — Added T12 (workspaces part), T16 part 1, T17 part 1 and T20, section 6b, and the unit and UI workspace tests. The old placeholder delete-dialog test moved to the real workspace list.

- **2026-11-15 (Phase 7)** — Added section 6a: unit tests (`npm run test:unit`), authentication UI tests, the client-bundle check, and the rule that the UI tests now need `.env.local`.
- **2026-11-15 (Phase 11)** — Added T9, T11 and T14, raised T8 to 10 concurrent requests, added section 6d (public booking tests).
- **2026-11-14** — Created (Phase 5). Documents the database tests T1–T8 and T19, which were written and run on this date.
- **2026-11-14 (Phase 6)** — Added the user-interface tests (`npm run test:ui`, 88 checks) and the Node 22 requirement.
