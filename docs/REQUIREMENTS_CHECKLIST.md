# SlotMate — Requirements Checklist

Prepared 2026-11-15 from `docs/PROJECT_REQUIREMENTS.md` (all 85 requirement IDs), `docs/TESTING.md`, `docs/DATABASE.md`, `docs/ARCHITECTURE.md`, `docs/DEVELOPMENT_LOG.md`, the real tests in `tests/unit`, `tests/ui` and `tests/db`, and the real source under `src/` where a criterion could be false.

## 1. How to read this checklist

**What was and was not done to make it.** The author of this checklist read the documents, the source and the test files, and checked that every test title quoted below exists in the test files. The first draft was written without running anything; in Phase 17 the full suites were then run (numbers in `docs/TESTING.md` section 7 and `docs/DEVELOPMENT_LOG.md`). "Done" therefore means "a test with that exact title exists and its documents report it as passing" (the last full pass reported in `docs/TESTING.md` is 2026-11-15, before the accessibility, performance and visual test files were added), or "the source shows it". Run `npm run test:unit`, `npm run test:ui` and `npm run test:db` yourself to re-confirm.

**Status words.**
- **done**: every acceptance criterion has an automated test, or is plainly true in the source (a note says when a small criterion has no test of its own).
- **partly**: at least one criterion has no automated test, is manual only, or is not built. The cell says which one.
- **not done**: nothing meets the requirement. (No requirement ended up here.)

**Evidence notation.** Test files are written short: `unit/slots` is `tests/unit/slots.spec.ts`, `ui/booking` is `tests/ui/booking.spec.ts`, `db/t08` is `tests/db/t08-parallel-booking.spec.ts`. The text in quotes is the real title (`test("...")` or the `describe` group), sometimes cut short with "...". "manual:" means a person must check it by hand. "no automated test found" means the author searched the test names and found none.

**Must / Nice: this classification is mine, because the requirements document gives none.**
- **Must** = every requirement that traces to a bullet of section 4 of the master prompt (traceability table, section 8 of `PROJECT_REQUIREMENTS.md`), plus every SEC and ISO requirement.
- **Nice** = requirements that come from other parts of the master prompt or from decisions (PERF-01, PERF-02, RESP-01, RESP-02, ROLE-01, ROLE-02), plus anything the documents themselves call optional.
- **One thing you should know.** `docs/ARCHITECTURE.md` section 8 ("Delivery priorities") *does* have its own Must-have / Nice-to-have tags. It calls five section-4 features optional: BOOK-08, ANLT-04, ANLT-06, EMBED-03 and EMBED-06 (and the 1,000-booking test of PERF-02). Following the rule "anything the documents call optional", I put those five in **Nice**. The same section tags PERF-01, PERF-02, RESP-01 and RESP-02 as Must-have, but under my rule they are Nice. The column "ARCH §8" shows the architecture document's own tag so you can compare. ROLE-01 and ROLE-02 have no tag there ("-").

## 2. The checklist (85 requirements)

### Roles

| ID | Name | Must/Nice | ARCH §8 | Status | Evidence |
|---|---|---|---|---|---|
| ROLE-01 | Organization owner | Nice | - | done | Dashboard reachable after login: `ui/auth` "login with an admin-created owner opens the dashboard and shows the email". No cross-owner access: `db/t01` "A cannot read any of B's rows" and the "another owner's ..." UI tests (see ISO-01). Exactly one owner per workspace, no invite feature: the source has no invite code or `workspace_members` table (DATABASE.md section 8); an absence, so no test. |
| ROLE-02 | Public visitor | Nice | - | done | Books without an account: `ui/booking` "full booking flow on a ${size.name}: pick, fill in, send, save the link, check the status". Dashboard closed to visitors: `ui/auth` "logged-out visitors are redirected to /login with a safe ?next=". Only booking data visible: see ISO-02. |

### A. Authentication

| ID | Name | Must/Nice | ARCH §8 | Status | Evidence |
|---|---|---|---|---|---|
| AUTH-01 | Register | Must | Must | **partly** | Done: 7-character password refused and nothing created (`ui/auth` "a 7-character password is refused and nothing is created"; `unit/schema` "refuses a 7-character password with the fixed message (D27)"); bad email (`ui/auth` "an invalid email is refused and nothing is created"); same address twice (`ui/auth` "sign-up for an address that already has an account shows the same message"); not confirmed means not logged in (`ui/auth` "an owner who has not confirmed the email is told to confirm"); link confirms and opens dashboard (`ui/auth` "a sign-up link confirms the account and opens the dashboard"); starts on Free (`db/t19` "T19 creating a user creates exactly one profile and one free subscription"). **Missing:** (1) the real confirmation email being sent: manual: sign up with a real inbox (the Phase 7 "real-inbox check" is still listed as not done by the owner in DEVELOPMENT_LOG, Open items). (2) The 8-character minimum **in the Supabase Auth settings** (criterion 5): no automated test can read that setting; the local `supabase/config.toml` says 6 and is known to differ from the live project, so manual: open Supabase dashboard, Authentication, password length. The server-side form rule (8) is tested. |
| AUTH-02 | Log in | Must | Must | done | `ui/auth` "login with an admin-created owner opens the dashboard and shows the email"; "a wrong password and an unknown email give the identical message"; "an owner who has not confirmed the email is told to confirm". |
| AUTH-03 | Log out | Must | Must | done | `ui/auth` "logout ends the session; /dashboard redirects again; Back shows no dashboard"; "dashboard responses are not cached (Back after logout shows no old page)". |
| AUTH-04 | Protected dashboard | Must | Must | done | `ui/auth` "logged-out /dashboard/${route} is redirected"; "after login the owner lands on the page they asked for"; `unit/architecture` "every dashboard page uses OwnerGate or requireOwner (A3 layer 2)". The "works with JavaScript off" criterion has no test of its own; it holds because the check runs on the server (proxy plus `requireOwner`). |
| AUTH-05 | Secure session handling | Must | Must | done | `ui/auth` "login cookies are httpOnly and not readable by page scripts (AUTH-05)"; "a made-up login cookie does not open the dashboard"; session survives a reload (the login test above, TESTING.md 6a); server reads the session: `unit/workspaces` "every exported action calls requireOwner() before anything else" and the matching guards in each feature's unit file. |
| AUTH-06 | Password recovery | Must | Must | **partly** | Done: same message for unknown address (`ui/auth` "forgot password shows the generic message for an address that does not exist"); new password works, old one does not, link cannot be reused (`ui/auth` "a recovery link opens the reset form; the new password works, the old one does not; the link cannot be reused"); bad link refused (`ui/auth` "no parameters, an unknown type, a bad token and a bad code all go to /login?error=link"). **Missing:** the real reset email being sent and the real PKCE `?code=` link opened in the same browser: manual (not automated on purpose, TESTING.md 6a "Not automated, and why"; owner's real-inbox check still open). An *expired* (as opposed to used) link: no automated test found. |

### B. Dashboard

| ID | Name | Must/Nice | ARCH §8 | Status | Evidence |
|---|---|---|---|---|---|
| DASH-01 | Total workspaces | Must | Must | done | `ui/workspaces` "shows the real workspace count and a link to the list". |
| DASH-02 | Total resources | Must | Must | done | Added in Phase 17 (found by this checklist): `ui/overview-and-copy` "DASH-02: the overview shows the real number of resources and follows a new and a deleted resource" (0, then 2, then 1 after a delete) and "DASH-02: another owner's resources are not counted". |
| DASH-03 | Total bookings | Must | Must | done | `ui/bookings` "the overview shows real numbers, 'Recent activity' with the 5 newest requests, and the pending requests needing a decision"; "a new owner sees zeros (not errors) and friendly empty lists". |
| DASH-04 | Bookings by status | Must | Must | done | `ui/bookings` "the badge counts only my pending requests, goes up with a new request and down with every decision and delete"; "approve: status changes, a success message shows, the pending badge goes down, ..." (the test also asserts the pending, approved and rejected numbers, in the DASH-04 comment of the test file). |
| DASH-05 | Booking trends over time | Must | Must | **partly** | The 30-day, zero-filled daily chart exists on the **Analytics** page (`ui/analytics` "sees the totals, the status chart and the 30-day chart with a text table, and a locked Pro area with no Pro data in the page"; `unit/analytics` "every day of the range is present, empty days are 0"; "a workspace with no bookings shows 'No data yet' and zero totals"). Missing: the **dashboard overview** itself shows no trend chart (the source has none), although the requirement says "The dashboard shows a chart". |
| DASH-06 | Recent booking activity | Must | Must | done | `ui/bookings` "the overview shows real numbers, 'Recent activity' with the 5 newest requests, ..." (5 of 7, newest first). Links to details are in the source (`src/app/dashboard/page.tsx`). |

### C. Workspace management

| ID | Name | Must/Nice | ARCH §8 | Status | Evidence |
|---|---|---|---|---|---|
| WORK-01 | Create a workspace | Must | Must | done | `ui/workspaces` "suggests the address and browser time zone, creates it, and lists it"; "an empty name creates nothing"; "an address used by ANOTHER owner is refused with \"That address is taken\""; limit: "a second create is refused with the upgrade prompt, even from a form opened earlier" and `db/t12` "${PARALLEL} parallel creates: exactly 1 succeeds, the rest get workspace_limit_reached". |
| WORK-02 | Edit workspace information | Must | Must | done | `ui/workspaces` "changes the name, description and address, and shows them in the list"; "an empty name is refused and nothing is saved"; "another owner's workspace is not found (the server refuses)"; "update with a foreign id plus forged owner_id and is_locked changes nothing and shows the generic message". Small gap: the edited values appearing on the public page have no test of their own. |
| WORK-03 | Delete a workspace | Must | Must | done | `ui/workspaces` "asks for confirmation; Cancel and Escape keep it; confirming deletes it for good"; `db/t17-workspace-cascade` "deleting a workspace removes embed row, resources, availability and bookings; usage stays"; foreign id: "delete with a foreign id deletes nothing (rows or image files) and shows the generic message". Small gap: no test checks the dialog's wording or that the public page then shows "not found" for that exact slug (an unknown slug is tested in `ui/booking` "missing workspace: 'not found'; a malformed address too"). |
| WORK-04 | Workspace settings (slug, time zone) | Must | Must | done | `ui/workspaces` "an invalid address shows a live hint and is refused by the server"; "a missing or unknown time zone is refused"; "changing the time zone shows the warning; changing it back hides it; it saves"; `db/t20` "an invalid zone name is refused on update and nothing changes"; "changing the zone keeps the booking moment (starts_at and ends_at unchanged)"; zone named on the public page: `unit/public-booking` "the zone is always named". |

### D. Resource management

| ID | Name | Must/Nice | ARCH §8 | Status | Evidence |
|---|---|---|---|---|---|
| RES-01 | Create a resource | Must | Must | done | `ui/resources` "creates a resource in a chosen workspace and lists it with the usage"; "the 4th resource is refused with an upgrade prompt; create is disabled at the limit"; `db/t12b` "${PARALLEL} parallel creates: exactly 3 succeed, the rest get resource_limit_reached"; `db/t01` "A cannot create rows that belong to B". |
| RES-02 | Edit a resource | Must | Must | done | `ui/resources` "edits a resource, including the availability switch (RES-06)"; "an empty name on edit is refused and nothing is saved"; "update with a foreign id plus forged owner_id, workspace_id and is_locked changes nothing". |
| RES-03 | Delete a resource | Must | Must | done | `ui/resources` "delete asks for confirmation; Cancel and Escape keep it; confirming deletes it"; "deleting a resource deletes its image file; deleting a workspace deletes all its resources' files"; `db/t17b` "deleting a resource removes its availability and bookings; workspace and usage stay"; "an owner cannot delete another owner's resource". |
| RES-04 | Name and description | Must | Must | done | `unit/resources` "a missing name and over-long text are refused"; `ui/resources` "an empty name, a bad slot length and a bad capacity are refused; nothing is created". Public display is part of the booking flow tests (`ui/booking`). |
| RES-05 | Resource image | Must | Must | done | `ui/resources` "a PNG is uploaded, shown, replaced (the old file is deleted) and removed"; "a file over 2 MB is refused (browser guard) and nothing is stored"; "a text file renamed .png (fake image) is refused by the server"; `unit/resources` "2 MB is the limit: exactly 2 MB passes, one byte more is refused"; `db/t21` "the bucket itself refuses other file types and files over 2 MiB, even from the server key". JPG and WebP through the browser: only the unit signature test (TESTING.md 6c "Not covered"). Placeholder image: not asserted by a named test. |
| RES-06 | Availability switch | Must | Must | **partly** | Done: switching it (`ui/resources` "edits a resource, including the availability switch (RES-06)"); hidden from visitors (`ui/booking` "a resource that is not available is hidden; a workspace with none shows a friendly message (PUB-02)"). **Missing:** "cannot be booked even by sending a request straight to the server": the check is in `submit_booking` (source, `is_available`), but no database or UI test calls it for an unavailable resource (no automated test found). "Existing bookings unchanged": no automated test found. |
| RES-07 | Booking duration | Must | Must | done | `unit/resources` "slot length \"${bad}\" is refused" and "slot length \"${ok}\" is accepted"; `ui/resources` "an empty name, a bad slot length and a bad capacity are refused; nothing is created"; slots of this length: `unit/slots` "${minutes}-minute slots". |
| RES-08 | Booking capacity | Must | Must | done | `unit/resources` "capacity \"${bad}\" is refused", "capacity 1 and 1000 are accepted"; `unit/public-booking` "attendees: whole number from 1 to the capacity"; `ui/booking` full flow (the capacity error shows next to the field). The database function also checks it (source, step 7), but no database test sends too many attendees directly (TESTING.md 6d "Known limits"). |

### E. Availability

| ID | Name | Must/Nice | ARCH §8 | Status | Evidence |
|---|---|---|---|---|---|
| AVAIL-01 | Available weekdays | Must | Must | done | `ui/availability` "opens days, saves them, shows them again after a reload, and writes the database rows"; `unit/slots` "a closed weekday (no window) gives no slots; only the listed weekdays open"; server refusal: `db/t10` "a start in the near past and a start exactly on a slot but outside the opening hours are refused like the app says" and the closed-weekday cases of "${zone} ${date}: the repeated hour, the skipped hour and slot ends agree (all slot lengths)". |
| AVAIL-02 | Operating hours | Must | Must | done | `ui/availability` "closing at or before opening is refused with a message on that day; nothing is saved"; "24:00 is accepted as the end of the day and gives slots up to midnight"; `unit/availability` "closing must be later than opening (equal and earlier are refused)". Time zone: `unit/slots` Europe/London, America/New_York, Australia/Sydney, Asia/Dhaka groups. |
| AVAIL-03 | Slots from duration | Must | Must | done | `unit/slots` "09:00-12:00 with 60-minute slots gives 09:00, 10:00, 11:00 (AVAIL-03 example)"; "a leftover shorter than one slot is not offered (09:00-12:30)"; "slots that already started, or start exactly now, are not offered"; "day 90 is offered, day 91 is not (counted in the workspace's zone)". See the 45-minute clock-change limitation in section 5. |
| AVAIL-04 | No overlapping reservations | Must | Must | done | `db/t09` "back-to-back bookings are allowed; the same slot twice is refused"; "pending and approved hold the slot; rejected frees it"; "cancelling an approved booking frees the slot; a deleted booking frees it too; a freed slot can be taken only once"; `ui/booking` "two browsers send the same time together: exactly one booking, the other is told it was just taken"; the database constraint is proved by `db/t08` (see PERF-03). |
| AVAIL-05 | Availability checked on the server | Must | Must | **partly** | Done: `db/t10` "ordinary days: offered slots are accepted with the same ends_at; limits and past agree" and the clock-change cases (reasons: past, too far, misaligned, outside hours, closed weekday, taken via `db/t09`); `db/t02` "anon and a logged-in owner are refused; nothing is created or counted" (only the server can book). **Missing:** the "resource is unavailable" refusal sent straight to the server: no automated test found (see RES-06). |

### F. Public booking page

| ID | Name | Must/Nice | ARCH §8 | Status | Evidence |
|---|---|---|---|---|---|
| PUB-01 | Unique public URL | Must | Must | done | Opens without login and unknown slug shows not found (`ui/booking` "missing workspace: 'not found'; a malformed address too"); unique (`ui/workspaces` "an address used by ANOTHER owner is refused with \"That address is taken\""); the owner sees the address on the workspace list and can copy the full address: `ui/overview-and-copy` "PUB-01: the owner can copy the full public address from the workspace list" (added in Phase 17). |
| PUB-02 | View available resources | Must | Must | done | `ui/booking` "a resource that is not available is hidden; a workspace with none shows a friendly message (PUB-02)". |
| PUB-03 | Descriptions and availability | Must | Must | done | `ui/booking` "the page HTML holds no other visitor's details and no owner data; a booked time is not offered again"; the full flow test. |
| PUB-04 | Collect visitor details | Must | Must | done | `unit/public-booking` "name: required, at most 100", "email: must be an address, at most 254", "attendees: whole number from 1 to the capacity", "phone: optional, at most 30, digits and + ( ) - . only; note at most 1000". Same checks on the server: "submitBooking order: allow-listed fields, rate limit, validation, random code, submit_booking, redirect". |
| PUB-05 | Choose date and time | Must | Must | done | `ui/booking` "only today up to 90 days ahead can be chosen; times that already started are not offered"; the zone is named in the full flow test; `unit/public-booking` "times are shown in the workspace's zone, never the host's". |
| PUB-06 | Submit without registration | Must | Must | done | Full flow (saved as pending with the code hash); `ui/booking` "two browsers send the same time together: exactly one booking, the other is told it was just taken"; "an owner who reached the monthly limit: the page says so and shows no form (D19); deleting bookings does not lower the count". |
| PUB-07 | Confirmation page | Must | Must | done | `ui/booking` "full booking flow on a ${size.name}: pick, fill in, send, save the link, check the status" (confirmation, copyable status link, refresh makes no second booking, per TESTING.md 6d); "after a successful booking, going Back shows no false error message (the redirect is not a failure)". |

### G. Booking management

| ID | Name | Must/Nice | ARCH §8 | Status | Evidence |
|---|---|---|---|---|---|
| BOOK-01 | List all booking requests | Must | Must | done | `ui/bookings` "shows name, resource, workspace, date and time in the workspace's NAMED zone, attendees and status; newest first; only my bookings"; "pagination: 45 bookings make 3 pages of 20, 20 and 5; a page past the end shows the last page"; "a new owner with no bookings sees a friendly empty message". |
| BOOK-02 | View booking details | Must | Must | done | `ui/bookings` "shows every visitor field, the resource, the workspace, the times in the named zone, the history and when it was submitted"; "another owner's booking, an unknown id and a malformed id all show 'not found'". |
| BOOK-03 | Approve | Must | Must | done | `ui/bookings` "approve: status changes, a success message shows, the pending badge goes down, the page offers Cancel booking instead"; `db/t13` "${from} -> ${to} is ${allowed ? 'allowed' : same ? 'a harmless no-op' : 'refused'}"; "approve, reject and delete with a forged booking id change and delete nothing". |
| BOOK-04 | Reject | Must | Must | done | `ui/bookings` "reject: status changes, the time is free again on the public page, the badge goes down"; `db/t13` as above. |
| BOOK-05 | Cancel approved | Must | Must | done | `ui/bookings` "cancel asks first (Keep it and Escape change nothing); confirming cancels and the same time can be booked again on the public page"; `db/t09` "cancelling an approved booking frees the slot; ...". |
| BOOK-06 | Delete | Must | Must | done | `ui/bookings` "delete asks first (Cancel and Escape keep it); confirming deletes it, shows a message, and the month's count is not given back (D19)"; "a delete works in every status"; `db/t17c` "deleting one booking and then all of them leaves monthly_usage unchanged"; `db/t17b` "an owner cannot delete another owner's resource" and `db/t01` "A cannot delete any of B's rows". |
| BOOK-07 | Filter by status | Must | Must | done | `ui/bookings` "the status buttons are toggle buttons; each shows only its status; the choice, the search and the page live in the address". |
| BOOK-08 | Search | Nice | Nice | done | `ui/bookings` "search finds a visitor name, an email or a resource name, ignoring case; no match and clearing both work"; "'%' and '_' are typed literally; ..."; `unit/bookings` "% _ and the backslash are letters, not wildcards". (A `*` typed in the search acts like a wildcard, see section 5.) |

### H. Notifications

| ID | Name | Must/Nice | ARCH §8 | Status | Evidence |
|---|---|---|---|---|---|
| NOTIF-01 | Confirmation message | Must | Must | done | Success: `ui/booking` full flow ("the success message and the copy button", TESTING.md 6d). Failure message with no success message: "two browsers send the same time together: exactly one booking, the other is told it was just taken". |
| NOTIF-02 | Notify owner (badge) | Must | Must | done | `ui/bookings` "the badge counts only my pending requests, goes up with a new request and down with every decision and delete". |
| NOTIF-03 | Booking status updates | Must | Must | done | `ui/booking` full flow (the owner approves, then cancels; the status page follows; a deleted booking shows "not found"); "status page: hidden from search engines, never cached, never passes its address on; unknown or malformed codes are 'not found'"; `unit/public-booking` "a 32-byte base64url code is exactly 43 characters and its hash is a 32-byte SHA-256"; owner success messages: `ui/bookings` approve and delete tests above. |

### I. Analytics

| ID | Name | Must/Nice | ARCH §8 | Status | Evidence |
|---|---|---|---|---|---|
| ANLT-01 | Booking statistics | Must | Must | done | `unit/analytics` "counts each status and the total; unknown statuses are ignored"; `ui/analytics` "sees the totals, the status chart and the 30-day chart with a text table, ...". Matching the booking list exactly: no test compares the two pages directly. |
| ANLT-02 | Daily chart | Must | Must | done | `unit/analytics` "every day of the range is present, empty days are 0"; "Asia/Dhaka (UTC+6): 18:00 to 23:59 UTC belongs to the NEXT local day"; `ui/analytics` "a workspace with no bookings shows 'No data yet' and zero totals". |
| ANLT-03 | Monthly chart (Pro) | Must | Must | done | `unit/analytics` "one point per month of the range, zero filled, months taken in the zone"; "a Free result has NO Pro dataset (the keys do not exist), a Pro result has them"; `ui/analytics` "sees the monthly chart, resource usage (most used first) and the range filter; ...". |
| ANLT-04 | Resource usage (Pro) | Nice | Nice | done | `unit/analytics` "most used first, ties by name, unused resources listed with 0"; the Pro and Free UI tests above. |
| ANLT-05 | Status distribution | Must | Must | done | `unit/analytics` "status totals (ANLT-01, ANLT-05)"; the Free UI test above shows the status chart. |
| ANLT-06 | Date filters (Pro) | Nice | Nice | done | `unit/analytics` "an end before the start is refused and the default is used"; `ui/analytics` "a from/to in the address is ignored: the period stays the last 30 days" (Free); "a Pro owner whose subscription ended gets the Free view (no Pro data)". |

### J. Embed widget

| ID | Name | Must/Nice | ARCH §8 | Status | Evidence |
|---|---|---|---|---|---|
| EMBED-01 | Generate a widget | Must | Must | done | `ui/embed` "a visitor books through the widget; the status link opens in a new tab; the booking exists"; same rules as the public page: the embed page uses the same booking flow and `submit_booking` (`unit/embed` "the embed-mode booking returns the status path instead of redirecting inside the frame"). |
| EMBED-02 | Iframe embed | Must | Must | done | `ui/embed` "the widget in an iframe on another origin" (a real host page on another origin); "/embed/<slug> is frameable by anyone; /login, /dashboard, /book and /booking are not"; `unit/embed` "/embed/* can be framed by any site and sends no X-Frame-Options". |
| EMBED-03 | Layouts (Pro) | Nice | Nice | done | `ui/embed` "a Pro owner saves theme, grid layout and a colour; the preview and the widget follow; the code holds only the address and size"; "a Free owner sees the Pro options disabled with an upgrade prompt; a forged Pro-only save is refused". |
| EMBED-04 | Light and dark themes | Must | Must | done | `unit/embed` "accepts a theme alone, or a full valid set"; "Free ignores the Pro values and keeps the theme"; `ui/embed` "a custom background colour reaches the whole booking form: every text keeps a readable contrast (EMBED-04)". |
| EMBED-05 | Background colour (Pro) | Must | Must | done | `ui/embed` "Pro values are applied for a Pro owner and ignored after a downgrade; the theme stays"; "a Free owner sees the Pro options disabled with an upgrade prompt; a forged Pro-only save is refused"; `unit/embed` "Free ignores the Pro values and keeps the theme". |
| EMBED-06 | Live preview | Nice | Nice | **partly** | Done: the preview is the real `/embed` page in an iframe (`ui/embed` "a Pro owner saves theme, grid layout and a colour; the preview and the widget follow; ..."), so it looks like the real widget. **Missing:** criterion 1, "updates **without saving** as the owner changes the options": the preview shows the **saved** options and updates after "Save" (the page itself says so). An owner decision on this is open (DEVELOPMENT_LOG, Open items). |
| EMBED-07 | Copyable embed code | Must | Must | done | The same `ui/embed` Pro test clicks "Copy code" and reads the clipboard (`navigator.clipboard.readText`); `unit/embed` "holds only the address and size". The code never depends on the options (they are stored on the server), so it "matches the chosen options" by design. |

### K. Subscription and billing

| ID | Name | Must/Nice | ARCH §8 | Status | Evidence |
|---|---|---|---|---|---|
| BILL-01 | Free plan | Must | Must | done | `db/t12` and `db/t12b` (1 workspace, 3 resources); `db/t11` "100 submissions succeed, the 101st gets limit_reached, deleting bookings does not lower the count, upgrading raises the limit"; Pro features locked: `ui/analytics` and `ui/embed` Free tests above. |
| BILL-02 | Pro plan | Must | Must | **partly** | Done: `ui/billing-webhook` "Pro limits work at once: five workspaces allowed, the sixth refused"; limits equal the database: `db/t18` "PLAN_LIMITS equals the plan_limits table exactly"; Pro analytics and widget: see ANLT and EMBED. The 25th resource and the 1,001st request are not exercised (only the numbers are compared in `db/t18`). **Missing:** "the price **charged** is $9.99": the landing page shows it (`ui/interactions` "the landing page shows the exact plan limits") but the real Stripe price object is configured in Stripe, not tested. manual: open Checkout and read the amount. |
| BILL-03 | Subscription page | Must | Must | done | `ui/billing` "a Free owner sees the Free plan, real usage, the upgrade button and no manage button"; "a Pro owner sees Pro, the renewal date and Manage subscription, and no upgrade button". Limits come from `src/lib/plans.ts`, proved equal to the database by `db/t18`. |
| BILL-04 | Stripe Checkout | Must | Must | **partly** | Done: `ui/billing` "the Upgrade button sends the owner to Stripe Checkout (nothing is paid)" (real `checkout.stripe.com`); "coming back from Checkout changes nothing by itself: still Free, with a confirming message or a cancelled message"; no card data in SlotMate (hosted Checkout; `unit/billing` "billing logs carry codes only"). **Missing:** the amount ($9.99 per month) on the real Checkout page: manual. Test-mode only: stated in the documents, not asserted by a test. |
| BILL-05 | Webhook integration | Must | Must | done | `ui/billing-webhook` "no signature, a garbage signature, a wrong secret and a tampered body are all refused (400) and change nothing"; "the verified checkout message made the owner Pro, from Stripe's own data"; "the same message twice is handled once (T15)"; `db/t16b` "webhook memory (T15): claimed, duplicate after marking, claimed again if the first try never finished"; `unit/billing` "billing actions: owner check first, no plan write, success never changes the plan". |
| BILL-06 | Subscription status record | Must | Must | done | `db/t19` (one subscription per owner); `db/t05` "every write by the owner is refused and the plan stays free"; `db/t03` "positive control: the owner CAN read their own subscription, anon cannot"; `db/t18` "effectivePlan agrees with current_plan() for every subscription state". |
| BILL-07 | Usage restrictions | Must | Must | done | `db/t11`, `db/t12`, `db/t12b` (above); `db/t17c` "a deleted booking frees its time; a new request for it counts again"; `ui/bookings` "near the monthly limit a Free owner sees an upgrade prompt, and deleted requests still count (D19)"; `ui/booking` "an owner who reached the monthly limit: the page says so and shows no form (D19); ...". Calendar-month reset on the 1st (UTC): by design in `monthly_usage`; no test waits for a month change. |
| BILL-08 | Upgrade | Must | Must | done | `ui/billing-webhook` "the verified checkout message made the owner Pro, from Stripe's own data"; "Pro limits work at once: five workspaces allowed, the sixth refused"; second subscription: `ui/billing-webhook-guards` "a second paid subscription for the same owner does not overwrite the stored one" and `unit/billing` "the billing page does not offer a second payment while a payment is being confirmed". (The test simulates the paid checkout with real Stripe test objects and signed messages; it does not type a card on the real page.) |
| BILL-09 | Cancel and downgrade | Must | Must | **partly** | Done: Manage button shown to Pro (`ui/billing` "a Pro owner sees Pro, the renewal date and Manage subscription, and no upgrade button"); `ui/billing-webhook` "cancelling at the end of the period keeps Pro and the page says Pro until the date"; "the subscription ending: Free, everything locked, banner, the owner chooses, exactly that is unlocked"; `db/t16` "downgrade locks everything, locked rows are read-only, a delete unlocks the rest"; `db/t16b` "Pro ends: everything is locked, bad selections are refused, a valid one unlocks exactly those". **Missing:** actually opening Stripe's Customer Portal and cancelling there on the real page, and waiting for a real period end: manual. The cancellation and the end are simulated with signed messages. |

### Security

| ID | Name | Must/Nice | ARCH §8 | Status | Evidence |
|---|---|---|---|---|---|
| SEC-01 | No secrets in code or GitHub | Must | Must | **partly** | Done: `.gitignore` ignores `.env*` and keeps `.env.example` (checked in the file); `ui/bundles` "no secret key value appears in any client file"; "no client file mentions the secret-key name, service_role or a secret key prefix"; `unit/architecture` "the secret-key variable name appears only in src/lib/supabase/admin.ts (A4)" and "the Stripe variable names appear only in src/lib/stripe/client.ts". **Missing:** "a search of the repository **and its history** finds no real keys": no automated test or recorded scan found. manual: run a secret scanner over `git log -p` before publishing. |
| SEC-02 | Server-side validation | Must | Must | **partly** | Done: zod checks repeated on the server for every form (`unit/schema`, `unit/workspaces`, `unit/resources`, `unit/availability`, `unit/public-booking`, `unit/embed`, `unit/bookings`) and the forged-field UI tests (for example `ui/resources` "forged owner_id, workspace_id, is_locked and image_path on the owner's OWN resource are ignored"). **Missing:** "text typed by users can never run as code": no automated test with script text (XSS) found; React escapes output, which is a design property, not a test. |
| SEC-03 | Authorization on every action | Must | Must | done | Logged out: `unit/workspaces`, `unit/resources`, `unit/availability`, `unit/bookings`, `unit/embed` and `unit/billing` each have a source guard that every action checks the owner first. Other owner's data: `ui/bookings` "another owner's booking, refused through the actions"; `ui/resources` "another owner's resource and forged fields (the server refuses)"; `ui/availability` "a save with a foreign resource id (and forged fields) changes nothing"; `ui/embed` "a forged workspace id of another owner changes nothing"; `ui/analytics` "the workspace selector lists only my own workspaces, switches between them, and a foreign id falls back to my first"; `db/t05` for the subscription. |
| SEC-04 | Webhook verification | Must | Must | done | `unit/billing` "signature check: a correct signature is accepted, anything else is refused"; `unit/webhook-handler` "a bad signature answers 400, and so does a missing one"; `ui/billing` "wrong or missing signatures are refused with 400 before anything else". A correctly signed message is accepted: `ui/billing-webhook` "the verified checkout message made the owner Pro, from Stripe's own data". |
| SEC-05 | Safe sessions | Must | Must | **partly** | Done: `ui/auth` "login cookies are httpOnly and not readable by page scripts (AUTH-05)"; `unit/architecture` "passwords and emails are never written to a log"; logout makes the session unusable: `ui/auth` "logout ends the session; /dashboard redirects again; Back shows no dashboard". **Missing:** "cookies sent only over HTTPS in production" (the `Secure` flag): no automated test found; manual: after deploying, read the Set-Cookie header of the login response. |
| SEC-06 | Rate limit on the public form | Must | Must | done | `db/t14` "5 attempts are allowed, the 6th and every later one is refused (refused attempts count)"; "another workspace is unaffected, another visitor in the same workspace is unaffected"; "it never counts toward the owner monthly limit, and no booking is made"; `ui/booking` "the 6th request in 10 minutes from one visitor to one workspace is refused; another workspace is unaffected". The 10-minute window ending cannot be tested (section 5). |

### Data isolation

| ID | Name | Must/Nice | ARCH §8 | Status | Evidence |
|---|---|---|---|---|---|
| ISO-01 | Owners see only their own data | Must | Must | done | `db/t07` "T7 every table in public has row level security enabled"; `db/t01` "A cannot read any of B's rows", "A cannot update any of B's rows", "A cannot delete any of B's rows"; web-address guessing: `ui/bookings` "another owner's booking, an unknown id and a malformed id all show 'not found'" and the matching "not found" tests for workspaces, resources and availability pages. |
| ISO-02 | Visitors see only what booking needs | Must | Must | done | `db/t04` "every insert, update and delete as anon is refused"; `db/t03` "anon cannot read rate_limit_attempts, stripe_events or subscriptions"; `ui/booking` "the page HTML holds no other visitor's details and no owner data; a booked time is not offered again"; `unit/public-booking` "the visitor-facing reads never select contact details; the owner id is not returned"; `ui/embed` "the page shows only what a visitor may see (no owner data, no other visitors' details)". |
| ISO-03 | Visitor details stay private | Must | Must | done | `ui/booking` privacy test above (A's name, email, phone and note are not in B's page); status page: `ui/booking` "status page: hidden from search engines, never cached, never passes its address on; ..." (the page's fields are chosen in `src/features/public-booking/queries.ts`, guarded by the `unit/public-booking` read guard). |

### Performance

| ID | Name | Must/Nice | ARCH §8 | Status | Evidence |
|---|---|---|---|---|---|
| PERF-01 | Page load time | Nice | Must | **partly** | Done: `ui/performance` "main content time of the public booking page and the dashboard stays under 3 s" (median of 5 runs, production build, local machine); a loading skeleton exists (`src/app/dashboard/loading.tsx`). Phase 17 measured the public booking page, the dashboard overview and the booking list: all about 0.9 s median locally. **Missing:** the home page and the login page are not timed; the criterion says "on the deployed site", but the test runs on a local build (numbers are "indicative", per the test's own comment). |
| PERF-02 | Lists stay fast | Nice | Must (1,000-booking test: Nice) | **partly** | Done: 20 per page, never all at once (`ui/bookings` "pagination: 45 bookings make 3 pages of 20, 20 and 5; a page past the end shows the last page"). **Missing:** the test with 1,000 bookings: no automated test found (the architecture document itself marks it Nice-to-have and skippable). |
| PERF-03 | Double-booking under load | Must | Must | done | `db/t08` "${ROUNDS} rounds of ${CALLS_PER_ROUND} simultaneous requests: one winner per round, usage +1 per round" (20 rounds of 10); `ui/booking` "two browsers send the same time together: exactly one booking, the other is told it was just taken"; the rule lives in the database (`db/t09`). |

### Responsive design

| ID | Name | Must/Nice | ARCH §8 | Status | Evidence |
|---|---|---|---|---|---|
| RESP-01 | Phone, tablet, desktop | Nice | Must | done | `ui/shells` "${route.name} at ${width}px" (375, 768 and 1280, no horizontal scrolling, plus dark theme); `ui/visual` "${spec.name} at ${width}px: no horizontal scrolling, screenshot saved"; `ui/accessibility` "${target.name} at ${width}px has no serious or critical violation"; `ui/analytics` "on a phone (375px) nothing overflows, for Free and for Pro"; `ui/bookings` "on a phone the resource and the time move under the name; nothing overflows; controls have names". Real devices and screen readers: manual. |
| RESP-02 | Public booking and widget on a phone | Nice | Must | done | `ui/booking` "full booking flow on a ${size.name}: pick, fill in, send, save the link, check the status" (375 px phone); `ui/embed` "fits a ${width}px wide iframe without sideways scrolling" (320, 480 and 800); `ui/interactions` "the menu's close button is big enough to tap on a phone". Real phone: manual. |

## 3. Summary counts

Counts are by status as given in the tables above. "Must" and "Nice" follow the classification in section 1 (mine).

| Area | IDs | Must | Nice | done | partly | not done |
|---|---|---|---|---|---|---|
| ROLE | 2 | 0 | 2 | 2 | 0 | 0 |
| AUTH | 6 | 6 | 0 | 4 | 2 | 0 |
| DASH | 6 | 6 | 0 | 5 | 1 | 0 |
| WORK | 4 | 4 | 0 | 4 | 0 | 0 |
| RES | 8 | 8 | 0 | 7 | 1 | 0 |
| AVAIL | 5 | 5 | 0 | 4 | 1 | 0 |
| PUB | 7 | 7 | 0 | 7 | 0 | 0 |
| BOOK | 8 | 7 | 1 | 8 | 0 | 0 |
| NOTIF | 3 | 3 | 0 | 3 | 0 | 0 |
| ANLT | 6 | 4 | 2 | 6 | 0 | 0 |
| EMBED | 7 | 5 | 2 | 6 | 1 | 0 |
| BILL | 9 | 9 | 0 | 6 | 3 | 0 |
| SEC | 6 | 6 | 0 | 3 | 3 | 0 |
| ISO | 3 | 3 | 0 | 3 | 0 | 0 |
| PERF | 3 | 1 | 2 | 1 | 2 | 0 |
| RESP | 2 | 0 | 2 | 2 | 0 | 0 |
| **All** | **85** | **74** | **11** | **71** | **14** | **0** |

**Must-haves (74):** 63 done, 11 partly, 0 not done.
**Nice-to-haves (11):** 8 done, 3 partly (EMBED-06, PERF-01, PERF-02), 0 not done.

The 11 Must-haves that are only partly done: AUTH-01, AUTH-06, DASH-05, RES-06, AVAIL-05, BILL-02, BILL-04, BILL-09, SEC-01, SEC-02, SEC-05. Most of them are one missing proof, not a missing feature. The one real gap in the product is DASH-05 (the dashboard overview has no 30-day chart; it is on the Analytics page). DASH-02 and PUB-01 were real gaps too; they were built in Phase 17.

## 4. What a person still has to check by hand (manual list)

1. Real sign-up, confirmation email, login, forgot-password email and reset in one real browser and inbox (AUTH-01, AUTH-06).
2. Supabase dashboard: the Auth minimum password length is 8, and "Secure password change" is on (AUTH-01).
3. Stripe test mode: the Checkout page shows $9.99 per month; Customer Portal opens and cancelling works; plan switching is off in the portal (BILL-02, BILL-04, BILL-09).
4. After deployment: the session cookie has the `Secure` flag (SEC-05); the three timed pages meet 3 seconds on the real site (PERF-01).
5. A secret scan of the whole Git history (SEC-01).
6. The hand-over lists of Phases 12, 13 and 14 (booking actions in a browser, charts in light and dark at 375 px, the embed code pasted into a real third-party page, a light widget while the system theme is dark): listed as "not tested by a person" in DEVELOPMENT_LOG, Open items.
7. Real phone and a screen reader (RESP-01, RESP-02; TESTING.md 6 and 6d).

## 5. Open known limitations

Each line names the document and section where it is described. "Doc" = the file; section names are the headings used there.

**Money and billing**
- **A past_due subscription loses Pro at once (no grace period).** If a card payment fails and Stripe marks the subscription `past_due`, SlotMate treats the owner as Free immediately, with the downgrade lock. Accepted for version 1. `DATABASE.md` 7.7 ("Known limitation — past_due loses Pro immediately") and decision DB7; `DEVELOPMENT_LOG.md` Phase 15 "Owner decisions after the review".
- **Phase 16 security review, two medium findings: fixed in Phase 17** (the webhook now ends Pro when the stored subscription leaves the Pro price, and cancels and refunds an extra subscription; `DATABASE.md` 7.6). What remains: whether the Customer Portal's plan switching is off cannot be checked from code, and the refund/cancel path was tested with real Stripe test objects only in test mode.
- **Not tested:** the webhook's deadlock retry, a Stripe outage, and the branch for a subscription Stripe no longer has. `TESTING.md` 6h "Status"; `DEVELOPMENT_LOG.md` Phase 15 "Still not tested".

**Dates and times**
- **45-minute slots on clock-change (DST) days.** On a clocks-forward day, slot lengths under 60 minutes that do not divide 60 (45, 25, 40, 50) can give two grid slots that overlap in real time. No double booking happens (the second is refused as "slot taken"), but a slot that looks free is refused on two days a year. 30, 60 and 90 minutes are fine. A fix (restrict `slot_minutes` or clamp the end) needs a new migration and your approval. `DATABASE.md` 7.2.1; `ARCHITECTURE.md` risk table ("Clock-change days"); `DEVELOPMENT_LOG.md` Open items "Database and tests" and "Availability (Phase 10)".
- **The clock-change test finds nothing to compare today.** `db/t10` has a test for clock changes inside the next 90 days; there are none between mid-November and mid-February, so it passes without comparing anything (the real clock-change days are covered by the other T10 tests). It also uses a read-only SQL *copy* of the function's end logic, not the function. `TESTING.md` section 3, T10.

**Widget and dashboard**
- **The live preview only changes after saving.** It shows the saved options, not unsaved form changes, because a preview of unsaved values would need a public way to pass options to `/embed` that could bypass the Pro gate. Owner decision still open. `DEVELOPMENT_LOG.md` Phase 14 "Not fixed ... (medium 5)" and Open items; `ARCHITECTURE.md` section 8 (EMBED-06 fallback).
- **The dashboard overview has no 30-day trend chart (DASH-05).** The chart is on the Analytics page (per workspace). A combined chart on the overview needs an owner decision (across workspaces with different time zones). The resources count (DASH-02) and the Copy link button (PUB-01) were added in Phase 17.
- **Widget low findings:** the "Copied" label never resets; the success panel has no copyable status link or "book again" button; `frame-ancestors *` does not cover `file:`, `data:` or sandboxed ancestors. `DEVELOPMENT_LOG.md` Phase 14 "Not fixed (low)".

**Bookings and analytics**
- **A `*` typed in the booking search acts as a wildcard** (harmless, owner's own data). `DEVELOPMENT_LOG.md` Open items "Booking management (Phase 12)".
- **Small polish items:** the list count and rows are two queries (the "of N" can be off by one if a booking arrives between them); filters are full-page submits; "approved this month" is based on `updated_at`. Same section.
- **Analytics edge cases:** offset paging can rarely repeat or skip a row if a booking changes between pages; status shares can add up to 99%; the data loads one query after another; long resource names clip on the chart axis. `DEVELOPMENT_LOG.md` Phase 13 "Not fixed (low)".
- **A missing or locked workspace answers with HTTP status 200** and a "Page not found" page (Cache Components streams the page first), so tests check the page, not the status code. `TESTING.md` 6d (public booking), "Known limits".

**Resources and images**
- **Images are checked by their first bytes only** (a corrupt file with a valid start is accepted); images are public by design (D9); a concurrent replace or an upload during a delete can leave an orphan file; no periodic sweep exists. `DEVELOPMENT_LOG.md` Open items "Resources and images (Phase 9)".
- **Availability is saved day by day**, so a failure part-way can leave a mix of old and new days (save again to fix); opening hours are typed as text, not picked. `DEVELOPMENT_LOG.md` Open items "Availability (Phase 10)".

**Rate limit and abuse**
- **People behind one shared address (for example a university network) share the allowance** of 5 requests per 10 minutes for the same workspace. Accepted cost of D24. `ARCHITECTURE.md` section 6 (rate limit), "Known weakness".
- **The 10-minute window ending and the clean-up of old rate-limit records cannot be tested** through real paths (no role can read or change that table). `TESTING.md` sections 3 (T14) and 5.
- **No CAPTCHA or app-level throttle on login and sign-up** (Supabase's own limits apply); small timing differences between known and unknown addresses remain; email scanners can use up one-time links; a link must be opened in the same browser that asked for it (PKCE). `DEVELOPMENT_LOG.md` Open items "Authentication (Phase 7)"; `TESTING.md` 6a "Not automated, and why".
- **No HSTS or CSP** beyond `frame-ancestors`; the `RATE_LIMIT_SECRET` length check was added later. `AGENTIC_TOOLS.md` section 6 (info and low items).

**Settings and environment**
- **The Supabase Auth settings are not verified from code.** The local `supabase/config.toml` differs from the live project in about 15 places (it says a minimum password length of 6) and must not be pushed. "Secure password change" still has to be turned on. `DEVELOPMENT_LOG.md` Open items "Authentication (Phase 7)".
- **`npm audit`** reported 7 moderate issues, deferred to Phase 17. `DEVELOPMENT_LOG.md` Open items "Project and tooling".
- **Mermaid diagrams** in `DATABASE.md` (1) and `ARCHITECTURE.md` (4) have not been rendered by a tool. `DATABASE.md` section 13.

**Testing and process**
- **No automatic pipeline (CI):** the three test suites run by hand against a real development project; Supabase limits password sign-ins, so a full UI run can report "Request rate limit reached" (wait and re-run); one bookings test ("the badge counts only my pending requests") failed once under load and passed alone. `TESTING.md` sections 5 and 6d; `DEVELOPMENT_LOG.md` Phase 15 "Flaky, known".
- **Documents out of date:** `TESTING.md` still has T13, T15, T16 part 2 and T17 part 3 under the heading "Planned", its header counts stop at Phase 11 to 15, and it does not describe the later accessibility, performance and visual test files. The totals in this checklist therefore come from the test files themselves, not from that document.
- **Manual checks by a person are not recorded as done** for Phases 12, 13 and 14 (section 4 above). `DEVELOPMENT_LOG.md` Open items.
- **Race tests are behaviour checks.** The two-browser race in `ui/booking` does not prove the requests overlapped in time; the real proof is `db/t08` (parallel calls). `TESTING.md` 6d "Known limits".
