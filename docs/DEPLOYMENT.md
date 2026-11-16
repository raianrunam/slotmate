# SlotMate deployment (Phase 18, part 1)

Date: 2026-11-16. This file lists **names only**. No secret value, password or Supabase project reference is written here (the repository is public).

**Production URL: https://slotmate-lac.vercel.app** (Vercel assigned the `-lac` suffix because `slotmate.vercel.app` was not free).

## 1. What was set up

| Part | Setup |
|---|---|
| Database | A second Supabase project, `slotmate-prod` (same organization as `slotmate-dev`, region `ap-southeast-1`, Singapore). Migrations 1–8 pushed to it. The development project is separate and untouched. |
| Hosting | Vercel project `slotmate`, connected to the GitHub repository `raianrunam/slotmate`. Framework Next.js, function region `sin1` (Singapore, next to the database), both set in `vercel.json`. `package.json` requires Node 22 or newer; Vercel uses its default (26.x). |
| Payments | Stripe **test mode** only. A test-mode webhook endpoint `https://slotmate-lac.vercel.app/api/stripe/webhook` for four events: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`. The same test price as development. Live mode is **not** set up. |

### Production environment variables (Vercel, Production only)

`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `RATE_LIMIT_SECRET`, `STRIPE_SECRET_KEY`, `STRIPE_PRO_PRICE_ID`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_APP_URL`.

- The three Supabase values come from `slotmate-prod` (fetched with the Supabase CLI and piped into Vercel, never shown).
- `RATE_LIMIT_SECRET` is new for production (64 hex characters, generated and piped in). It differs from the development one.
- `STRIPE_SECRET_KEY`, `RATE_LIMIT_SECRET`, `SUPABASE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` are stored as Vercel "sensitive" values (unreadable after saving).
- `NEXT_PUBLIC_*` values are baked into the build: **after changing one, redeploy**.
- The production database password exists only in a file outside the repository (the owner's notes folder). It is not used by the app (the app talks to Supabase through its API keys).

### Supabase Auth settings on `slotmate-prod` (dashboard, set by the owner on 2026-11-16)

Confirm email ON; minimum password length 8; Secure password change ON; Site URL `https://slotmate-lac.vercel.app`; Redirect URLs `https://slotmate-lac.vercel.app/**`. These are dashboard settings: they are **not verified from code**, and `supabase config push` must never be used (see README).

## 2. How to redeploy

- **Normal way:** push to `main`. Vercel builds and publishes by itself (the repository is connected).
- **By hand** (PowerShell, from the repository folder): `npx vercel deploy --prod --yes`.
- **Changing a variable:** `npx vercel env add NAME --environment production --force` (the value is asked for or piped in), then redeploy.

## 3. How a database change reaches production

A pushed migration is never edited; a change is a new migration, and every push needs the owner's approval.

1. Link the CLI to production: `npx supabase link --project-ref <production reference>`.
2. Dry run: `npx supabase db push --remote --dry-run`. Check that the target says `slotmate-prod` and the listed migrations are the ones you expect.
3. Push (owner approves): `npx supabase db push --remote`.
4. Check read-only with `npx supabase db query --remote --read-only`.
5. **Link back to development straight away** (`npx supabase link --project-ref <development reference>`) and confirm with a dry run that it says `slotmate-dev` and "up to date". `npm run test:db` must only ever run against development.

## 4. Checks run on 2026-11-16 and their results

### 4a. Production database (read-only queries after the push)

- 8 migrations applied; the dry run before listed exactly the 8 files and the target `slotmate-prod`.
- Row level security on for **all 11** public tables.
- No function in `public` can be run by `anon` or `authenticated`; the server-only ones (`submit_booking`, `check_rate_limit`, `apply_downgrade_selection`, `claim_stripe_event`, `mark_stripe_event_processed`, `reconcile_locks`, `set_resource_image`, `current_plan`) can be run by `service_role`.
- `plan_limits`: free = 1 workspace / 3 resources / 100 bookings per month; pro = 5 / 25 / 1,000. Storage bucket `resource-images`: public, 2 MB limit, JPEG/PNG/WebP only.
- Compared with development: identical **except one harmless difference**: in production `service_role` also has EXECUTE on the trigger functions (`enforce_*`, `handle_new_*`, `reconcile_locks_after_*`, `set_updated_at`, `validate_time_zone`). A newer Supabase project gets this as a default; development was created earlier. It is not a security problem (the server key bypasses the rules anyway, and trigger functions cannot be called directly). Not changed (a change needs a new migration and the owner's approval).

### 4b. Headers on the deployed site (`curl`)

| Path | Result |
|---|---|
| `/`, `/login`, `/book/x` | 200; `X-Frame-Options: DENY`, `Content-Security-Policy: frame-ancestors 'none'`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, HSTS (Vercel adds it) |
| `/dashboard` (logged out) | 307 to `/login?next=%2Fdashboard`; `Cache-Control: private, no-store` plus the same headers |
| `/booking/<43 characters>` | 200; `Cache-Control: private, no-store, max-age=0`, `Referrer-Policy: no-referrer`, `X-Robots-Tag: noindex, nofollow`, DENY, `frame-ancestors 'none'` (Phase 11 finding 10 **confirmed on Vercel**) |
| `/%62ooking/<43 characters>` | 404 (not the status page), general headers |
| `/embed/x` | 200; `Content-Security-Policy: frame-ancestors *`, no `X-Frame-Options` |
| `/api/stripe/webhook` | GET 405; POST without or with a wrong signature 400 |

### 4c. Forged `x-forwarded-for` (Phase 11 item 6)

The app has no endpoint that shows the address it sees, and none was added. A throw-away Vercel project (deleted afterwards) with a tiny function that only echoed the header was called with `X-Forwarded-For: 1.2.3.4, 5.6.7.8`. The function received **one** value, and neither forged address was in it. So on Vercel the platform replaces the header and a visitor cannot choose the address the rate limit sees. (Limit of the proof: it tests Vercel's platform behaviour on a probe, not the SlotMate code path itself.)

### 4d. Speed, PERF-01 (real Chromium, fresh browser context each run, 5 runs per page, from the owner's computer)

| Page | Main content visible, median (all runs) | Largest paint, median |
|---|---|---|
| `/` | 0.36 s (0.28–0.42 s, except one cold first request of 3.95 s in the very first run) | 0.34 s |
| `/login` | 0.30 s (0.28–0.45 s) | 0.60 s |
| `/book/x` | 0.38 s (0.26–0.40 s) | 0.47 s |

A second run of 15 loads had none above 0.45 s. **Limits:** production has no workspace yet, so `/book/x` is the "page not found" variant of the public booking page, not a page with a real resource list; the dashboard and the booking list need a login and were not timed on production.

### 4e. Secrets in the deployed code

19 script files plus 7 HTML pages (1.34 million characters) were fetched and searched: the real production secret key (both the new and the legacy form), the database password, the prefixes `sb_secret_`, `whsec_`, `sk_`/`rk_`, any variable name of a secret, any `postgres://` address and any JWT. **Zero matches.** (The publishable key does not appear either, so the browser code does not talk to Supabase directly on those pages.)

## 5. Checks by hand

**Done by the owner on 2026-11-16** (manual, owner): the session cookies on production are `Secure` and `HttpOnly` (SEC-05); a real sign-up with a real inbox, the confirmation link landed on the production site and login worked; a booking worked on production; a Stripe test payment made the owner Pro (the production webhook works); the production Supabase Auth settings and URL configuration are set. **Still open:** item 4 below (timing). The original list follows.

1. **SEC-05:** log in on the production site and confirm the session cookie has the `Secure` flag (browser developer tools, Application, Cookies).
2. **One real sign-up** with a real inbox: the confirmation email arrives, the link lands on the production site, login works.
3. **One test payment** on production with a Stripe test card: Checkout, return, the plan changes to Pro (this proves the webhook secret and the price id work).
4. Time `/book/<real slug>`, the dashboard and the booking list on production once a workspace exists (finishes PERF-01).

## 6. Things that went differently from the plan

- `vercel link` added a Vercel access token (`VERCEL_OIDC_TOKEN`) to the owner's local `.env.local` and appended duplicate lines to `.gitignore`. The duplicates were removed again; the owner should check that `.env.local` still has its own lines.
- The Vercel CLI could not connect the GitHub repository until the owner installed the Vercel GitHub app in the browser.
- The first guess of the production address (`slotmate.vercel.app`) was wrong; `NEXT_PUBLIC_APP_URL` was corrected and the site redeployed.
- A Vercel project named `xff-probe` was created for 4c **without the owner's explicit authorization** (the agent should have asked first). It was harmless (no secrets, no data) and was deleted with the owner's approval.

## Change history

- **2026-11-16** — Created (Phase 18, part 1).
- **2026-11-16** — Recorded the owner's production checks (section 5) and the unauthorized `xff-probe` creation (section 6).
