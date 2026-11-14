# SlotMate

SlotMate is a booking and resource-management web app. An **owner** creates workspaces and the things people can book (rooms, desks, equipment, appointments), sets when each one is open, and shares a public page where **visitors** request a time slot without creating an account. The owner then approves or rejects each request from a dashboard. Paid plans raise the limits and unlock more analytics and a customizable website widget.

> **Status: work in progress (Phases 1–5 of 18 done).** The requirements, architecture and database are designed and built, and the database is partly tested (9 of the 21 designed tests so far; see [`docs/TESTING.md`](docs/TESTING.md)). The web interface and the features below are **not built yet**. This README describes the plan and says what exists today.

This is also a learning project: the owner is learning software engineering and working with AI coding agents. The honest story of what went well and what went wrong is in [`docs/DEVELOPMENT_LOG.md`](docs/DEVELOPMENT_LOG.md).

## Words used in this README

- **Row level security (RLS):** rules inside the database that decide, row by row, who may read or change data.
- **Migration:** one SQL file that changes the database; the files run in order and are kept in Git.
- **Project reference:** the short code that identifies your Supabase project.
- **Publishable key and secret key:** Supabase's two API keys. The publishable key is safe to show but, on its own, grants nothing here. The secret key bypasses every security rule, so it stays on the server and out of Git.
- **Webhook:** a message that another service (here Stripe) sends to our server when something happens.
- **Iframe:** a way to show one web page inside another website; the embeddable widget uses it.
- **Server Action:** a server function that a form calls when it is submitted.

More definitions: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) section 0 and [`docs/DATABASE.md`](docs/DATABASE.md) section 1.

## Features

Planned for version 1 (requirement IDs are in [`docs/PROJECT_REQUIREMENTS.md`](docs/PROJECT_REQUIREMENTS.md)):

- **Accounts** for owners: register, log in, log out, password recovery, a protected dashboard.
- **Workspaces** (one place an owner manages, with its own public address and time zone) and **resources** (a bookable thing, with a description, an image, a fixed slot length and a capacity).
- **Weekly availability** per resource: open weekdays and opening hours; slots are cut from the slot length. Two bookings can never overlap.
- **Public booking page** per workspace: visitors choose a resource, a date and a time, give their details and submit, with no registration. A private status link shows the request's state.
- **Booking management**: list, details, approve, reject, cancel an approved booking, delete, filter by status, search by visitor or resource.
- **Analytics** dashboard with charts.
- **Embeddable widget** (an iframe) that shows the booking page on another website, with a live preview and copyable code.
- **Billing** with Stripe (test mode): upgrade, cancel, and a locked-but-safe state on downgrade.

### Free and Pro plans

- **Free**: 1 workspace, 3 resources, 100 booking requests per month, basic analytics, basic embed widget (light or dark theme).
- **Pro** ($9.99 per month): 5 workspaces, 25 resources, 1,000 booking requests per month, advanced analytics (monthly chart, resource usage, date filters) and the customizable widget (grid layout, background colour).

The limits are stored in the database and are designed to be enforced there, not only in the interface (the SQL is deployed; the tests for the limits are planned). If an owner downgrades, nothing is deleted: the owner chooses one workspace and up to three resources to keep active, and the rest become read-only until the owner deletes some or upgrades.

## Tech stack

- **Next.js 16** (App Router), **React 19**, **TypeScript**, **Tailwind CSS 4**
- **Supabase**: PostgreSQL with row level security, Auth, Storage
- **Stripe** (test mode) for subscriptions: planned (Phase 15)
- **Recharts** for charts: planned (Phase 13)
- **Playwright** for tests
- **Supabase CLI** for migrations and generated types

Everything not yet in `package.json` (Stripe, Recharts, `zod`, `date-fns`, shadcn/ui and so on) is planned: see the technology list in [`docs/MASTER_PROMPT.md`](docs/MASTER_PROMPT.md) and the extra libraries in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) section 9; each addition needs its own approval.

## Architecture in short

The browser never talks to the database. Pages and forms go through our Next.js server, which checks every rule; the database is the last line of defence and enforces the rules that matter most (data isolation, plan limits, no double booking, allowed status changes). Visitors have no database permissions at all: public pages are built by server code. Times are stored as exact moments, opening hours as plain clock times, and every workspace has a time zone name.

Read more:

- [`docs/MASTER_PROMPT.md`](docs/MASTER_PROMPT.md): the project brief and the 18 phases.
- [`docs/PROJECT_REQUIREMENTS.md`](docs/PROJECT_REQUIREMENTS.md): what the app must do.
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md): how the parts fit together and where each security check happens.
- [`docs/DATABASE.md`](docs/DATABASE.md): tables, rules, functions, row level security, migration plan.
- [`docs/TESTING.md`](docs/TESTING.md): how the database tests work and what they prove.
- [`docs/DEVELOPMENT_LOG.md`](docs/DEVELOPMENT_LOG.md): the development diary, including agent mistakes and open items.
- [`AGENTS.md`](AGENTS.md) and [`CLAUDE.md`](CLAUDE.md): the rules AI coding agents follow in this repository.

## Project status

- **Phase 1** Understand Claude Code and prepare the environment: done
- **Phase 2** Create the GitHub repository and initialize the project: done
- **Phase 3** Define requirements and architecture: done
- **Phase 4** Design the database and relationships: done. Seven migrations are applied to the development project; 9 of the 21 designed tests (T1–T8 and T19, run as 19 Playwright test cases) pass.
- **Phase 5** Create `CLAUDE.md` and project documentation: done
- **Phase 6** Design the frontend and reusable UI components: planned
- **Phase 7** Authentication: planned
- **Phase 8** Workspace management: planned
- **Phase 9** Resource management: planned
- **Phase 10** Availability management: planned
- **Phase 11** Public booking: planned
- **Phase 12** Booking management: planned
- **Phase 13** Dashboard analytics: planned
- **Phase 14** Embed widgets: planned
- **Phase 15** Stripe billing: planned
- **Phase 16** Agentic tools and parallel development: planned
- **Phase 17** Complete testing and bug fixing: planned
- **Phase 18** README, screenshots and submission reflection: planned

## Getting started

These steps set up your own copy against your own Supabase project. Do them **in this order**.

**You need:** Node.js 20.12 or newer (Next.js needs 20.9; the test configuration uses a loader added in 20.12), npm, Git, and a free [Supabase](https://supabase.com) account. A Stripe test-mode account is only needed from Phase 15.

1. **Clone and install.**

   ```powershell
   git clone <repository-url>
   cd slotmate
   npm install
   ```

2. **Create a Supabase project** for development (keep production separate). Save the database password somewhere safe; the CLI may ask for it in step 4. You will also need the project's **reference** (the short code in the project's address) in step 4. Never put either in a file that is committed.

3. **Create `.env.local`** from the template and fill in the values. `.env.local` is ignored by Git; never commit it.

   ```powershell
   Copy-Item .env.example .env.local
   ```

   - `NEXT_PUBLIC_SUPABASE_URL`: Project Settings > Data API (or the Connect button).
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and `SUPABASE_SECRET_KEY`: Project Settings > API Keys. The secret key bypasses all security rules: keep it server-side only.
   - `NEXT_PUBLIC_APP_URL`: `http://localhost:3000` while developing.
   - `RATE_LIMIT_SECRET`: any long random string, for example from `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
   - The `STRIPE_*` variables are only needed from Phase 15 and can stay empty until then.

   The full list of names and what each is for: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) section 7.

4. **Log in to the Supabase CLI and link your project.**

   ```powershell
   npx supabase login
   npx supabase link --project-ref <your-project-ref>
   ```

5. **Apply the database migrations** (this changes your Supabase project). Supabase CLI v3 needs `--remote`. Look first, then apply:

   ```powershell
   npx supabase db push --remote --dry-run
   npx supabase db push --remote
   ```

   This creates the 11 tables, the functions, the security policies and the image bucket (migrations 1–7 in `supabase/migrations/`). A migration that has been pushed is never edited; a change is a new migration.

6. **Start the app.**

   ```powershell
   npm run dev
   ```

   Open <http://localhost:3000>. Today this shows only a placeholder page; the interface is built from Phase 6.

7. **Run the checks.**

   ```powershell
   npm run test:db
   npx tsc --noEmit
   npx eslint
   ```

   `npm run test:db` creates and deletes real test users in the Supabase project that `.env.local` points to, so use a development project. Two of its tests (T6 and T7) also call the Supabase CLI, so they need the login and link from step 4 and the migrations from step 5. No browser download is needed. See [`docs/TESTING.md`](docs/TESTING.md).

Authentication settings in the Supabase dashboard (site URL, redirect URLs, email confirmation) are configured in Phase 7 and will be documented here then.

## Scripts

- `npm run dev`: start the development server.
- `npm run build` and `npm run start`: build and run the production build.
- `npm run lint`: run ESLint.
- `npm run test:db`: run the database tests (`playwright test tests/db`).
- `npx tsc --noEmit`: type-check the project.
- `npx supabase gen types --remote --lang typescript --schema public > src/types/database.types.ts`: regenerate the database types after a migration.

## Folder structure

What exists today:

```
slotmate/
├── AGENTS.md, CLAUDE.md     Rules for AI coding agents
├── .claude/settings.json    Claude Code settings (blocks reading .env files)
├── docs/                    Requirements, architecture, database, testing, development log
├── public/                  Static files (from the Next.js starter)
├── src/
│   ├── app/                 Next.js pages (a placeholder home page so far)
│   └── types/               TypeScript types generated from the database
├── supabase/
│   ├── config.toml          Supabase CLI settings
│   └── migrations/          The 7 database migrations (SQL, in order)
├── tests/db/                Database tests (Playwright test runner, no browser)
├── playwright.config.ts     Test settings
├── next.config.ts, eslint.config.mjs, tsconfig.json, package.json   Project configuration
└── .env.example             Environment variable names (no values)
```

The planned layout of `src/` (features, shared libraries, components) is in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) section 2.

## Security model in plain words

Built and tested today (the database):

- **Every table has row level security on.** An owner can only see and change their own rows. Test T1 tries to read, change and delete another owner's data in every table that holds owner data, and fails as it should.
- **Strangers get nothing.** The public key on its own gets no table privileges (checked once with a read-only privilege query after the migrations were applied; T3 and T4 test the most sensitive tables), cannot call any function (the audit T6 checks every function, and T2 tries `submit_booking`), and no policy is granted to it (T7 also checks that every table has row level security on). Functions that only our server may call (booking submission, the rate limit, Stripe event memory, the downgrade selection) are closed to the browser roles.
- **Owners cannot change their plan or their usage.** The subscription is read-only for the owner (T5). By design only our server can change it, after checking a signed Stripe message (the webhook is planned for Phase 15).
- **No double booking.** The database refuses two pending or approved bookings that overlap on the same resource. Tested so far: the same slot requested by several visitors at the same moment, where exactly one wins (T8). Overlapping slots with different start times and back-to-back slots are planned (T9).
- **Plan limits and allowed status changes live in the database**, so even a request that skips our web pages cannot break them. (Designed and reviewed; the tests for these are planned.)

Planned in the application: login and sessions, checking Stripe's signature on webhook messages, the per-visitor rate limit on the public form, and keeping secrets on the server only. The repository is public, so no secret key, project reference or personal email address may ever be committed, and `.env.local` is ignored by Git. (The files were checked for these on 2026-11-14.)

## Screenshots and demo

Screenshots and a short demo will be added in Phase 18.

- Dashboard overview: _screenshot placeholder_
- Public booking page on a phone: _screenshot placeholder_
- Embed widget on a sample page: _screenshot placeholder_
- Demo video or live link: _placeholder_

## License

No license has been chosen yet.
