# SlotMate — Database Design

Last updated: 2026-11-12 · Phase 4 (Database design) · Sources: `docs/MASTER_PROMPT.md`, `docs/PROJECT_REQUIREMENTS.md`, `docs/ARCHITECTURE.md`

**Status:** design only. No SQL files exist yet and nothing has been created in Supabase. Every SQL snippet in this document is a sketch to explain an idea and has **not** been run against a database (see section 13).

---

## 1. Introduction and glossary

The requirements say *what* SlotMate does, the architecture says *how the parts fit*. This document says *what data exists and which rules the database itself enforces*. The database is the last line of defence (architecture section 3.2): even if our server code has a bug, these rules still hold.

Requirement IDs (`BILL-07`), requirement decisions (`D19`), architecture decisions (`A5`) and database decisions (`DB1`–`DB17`, section 12) refer to the other documents.

| Word | Meaning |
|---|---|
| **Table / row / column** | A table is a spreadsheet-like list. Each row is one item (one booking). Each column is one fact about it (the visitor's name). |
| **Primary key (PK)** | The column(s) that identify a row uniquely. No two rows share a PK and it is never empty. |
| **Foreign key (FK)** | A column that points at a row in another table, for example `resources.workspace_id` points at a workspace. The database refuses a value that points at nothing. |
| **ON DELETE** | What happens to the rows that point at a row when that row is deleted. `CASCADE` = they are deleted too. `RESTRICT` = the delete is refused. |
| **Unique constraint** | A rule that no two rows may have the same value (or the same combination of values). |
| **Check constraint** | A rule about one row, for example "capacity is at least 1". The database refuses a row that breaks it. |
| **Exclusion constraint** | Like a unique constraint, but for *overlaps*: "no two rows may overlap in time for the same resource". |
| **Index** | A sorted lookup structure that makes searches fast, like the index of a book. It costs a little space and slows writes slightly. |
| **Constraint** | Any rule the database enforces by itself (PK, FK, unique, check, exclusion). |
| **Trigger** | A small function the database runs automatically when a row is inserted, changed or deleted. |
| **Function** | Code stored inside the database (written in PL/pgSQL) that our server can call as one step. |
| **Transaction** | A group of steps that either all succeed or all are undone together. |
| **Race condition** | A bug that appears only when two things happen at nearly the same moment and their steps interleave. |
| **Row Level Security (RLS)** | Rules attached to a table that decide, row by row, who may read or change it. With RLS on and no matching rule, nobody gets in. |
| **Policy** | One RLS rule. |
| **Role** | A database identity with permissions. Supabase gives us `anon` (no login, the public key), `authenticated` (a logged-in owner) and `service_role` (our server using the secret key; it skips RLS). |
| **Privilege / GRANT / REVOKE** | The permission to use a table or function at all (before RLS even looks at rows). `REVOKE` removes it. |
| **SECURITY DEFINER** | A function that runs with its creator's powers instead of the caller's, so it can do things the caller may not. Dangerous unless locked down (section 6). |
| **`search_path`** | The list of places Postgres searches when a function mentions a name. If it is not fixed, an attacker could plant a look-alike object. |
| **`timestamptz`** | "Timestamp with time zone": an exact moment in time. Postgres stores it in UTC. |
| **Enum** | A column that may hold only one of a fixed list of words, for example `pending`, `approved`. |
| **Migration** | One SQL file that changes the database. Files run in order and are kept in Git. |

---

## 2. Entity-relationship diagram

An ER diagram shows the tables, their main columns and how they connect. In the lines below, `||--||` means one-to-one, `||--o{` means one-to-many (one on the left, zero or more on the right). `AUTH_USERS` is Supabase Auth's own table; we do not create it.

```mermaid
erDiagram
  AUTH_USERS ||--|| PROFILES : "is"
  PROFILES ||--|| SUBSCRIPTIONS : "has one"
  PROFILES ||--o{ WORKSPACES : "owns"
  PROFILES ||--o{ MONTHLY_USAGE : "counted per month"
  WORKSPACES ||--o{ RESOURCES : "contains"
  WORKSPACES ||--|| EMBED_CONFIGURATIONS : "has one"
  WORKSPACES ||--o{ RATE_LIMIT_ATTEMPTS : "receives"
  RESOURCES ||--o{ RESOURCE_AVAILABILITY : "open on"
  RESOURCES ||--o{ BOOKINGS : "booked as"
  PLAN_LIMITS ||--o{ SUBSCRIPTIONS : "limits for plan"

  AUTH_USERS {
    uuid id PK
  }
  PROFILES {
    uuid id PK "same as auth user id"
    timestamptz created_at
  }
  SUBSCRIPTIONS {
    uuid owner_id PK "FK profiles"
    plan_type plan
    text status
    text stripe_customer_id UK
    text stripe_subscription_id UK
    timestamptz current_period_end
    boolean cancel_at_period_end
  }
  PLAN_LIMITS {
    plan_type plan PK
    int max_workspaces
    int max_resources
    int max_monthly_bookings
  }
  WORKSPACES {
    uuid id PK
    uuid owner_id FK
    text name
    text slug UK
    text time_zone
    boolean is_locked
  }
  RESOURCES {
    uuid id PK
    uuid workspace_id FK
    uuid owner_id FK "copy of workspace owner"
    text name
    int slot_minutes
    int capacity
    boolean is_available
    boolean is_locked
  }
  RESOURCE_AVAILABILITY {
    uuid id PK
    uuid resource_id FK
    smallint weekday "1 Monday to 7 Sunday"
    time opens_at
    time closes_at
  }
  BOOKINGS {
    uuid id PK
    uuid resource_id FK
    uuid owner_id FK "copy of resource owner"
    text visitor_name
    text visitor_email
    int attendees
    timestamptz starts_at
    timestamptz ends_at
    booking_status status
    bytea status_token_hash UK
  }
  MONTHLY_USAGE {
    uuid owner_id PK "FK profiles"
    date month PK "first day of UTC month"
    int booking_count
  }
  RATE_LIMIT_ATTEMPTS {
    bigint id PK
    uuid workspace_id FK
    bytea ip_hash
    timestamptz attempted_at
  }
  STRIPE_EVENTS {
    text event_id PK
    text event_type
    timestamptz processed_at
  }
  EMBED_CONFIGURATIONS {
    uuid workspace_id PK "FK workspaces"
    embed_theme theme
    embed_layout layout
    text background_color
  }
```

Two things the picture deliberately shows:

- `MONTHLY_USAGE` hangs off the **owner**, not off bookings or workspaces. Deleting a booking, resource or workspace never touches it (D13 + D19, section 7.3).
- `STRIPE_EVENTS` has no line to anything. It is a standalone memory of which Stripe messages were handled (section 7.6).
- `workspace_members` does not exist (section 8).

---

## 3. Tables

Conventions used by every table:

- Primary keys are `uuid` with `default gen_random_uuid()` (built into Postgres), except where stated. Random IDs cannot be guessed from a web address (ISO-01).
- `created_at` / `updated_at` are `timestamptz not null default now()`. `updated_at` is kept current by the `set_updated_at()` trigger.
- "Required" means `NOT NULL`. "Optional" means the column may be empty (`NULL`).
- Text limits exist so nobody can store megabytes in a name field. The server's `zod` rules (architecture L3) use the same numbers.

### 3.1 `profiles`

**Purpose:** one row per owner account. It anchors ownership (other tables point at it) and gives us one row to lock when we must serialise an owner's changes (section 7.7). Created automatically by a trigger when Supabase Auth creates the account, so server code cannot forget it.

| Column | Type | Required | Default | Note |
|---|---|---|---|---|
| `id` | uuid | required | — | Same value as the Auth user ID. |
| `created_at` | timestamptz | required | `now()` | When the account was made. |

- **PK:** `id`.
- **FK:** `id` → `auth.users(id)` **ON DELETE CASCADE**. If the Auth account is removed, the profile and (through the cascades below) everything the owner had goes too.
- **Unique / check:** none beyond the PK.
- **Indexes:** the PK index only.
- **No email column** (DB2): the email already lives in Supabase Auth; a copy could drift and would be one more private field to protect.

### 3.2 `subscriptions`

**Purpose:** one row per owner holding the plan and the mirrored Stripe state. Every plan limit reads it (BILL-06). Owners can only read it.

| Column | Type | Required | Default | Note |
|---|---|---|---|---|
| `owner_id` | uuid | required | — | Which owner. |
| `plan` | `plan_type` | required | `'free'` | `free` or `pro`. |
| `status` | text | optional | `NULL` | Stripe's own word (`active`, `trialing`, `past_due`, `canceled`…). `NULL` for an owner who never subscribed. Stripe owns this vocabulary, so we add no check list that a new Stripe value could break. |
| `stripe_customer_id` | text | optional | `NULL` | Set at the first checkout. |
| `stripe_subscription_id` | text | optional | `NULL` | Set while a paid subscription exists. |
| `current_period_end` | timestamptz | optional | `NULL` | End of the paid period; shown on the billing page. |
| `cancel_at_period_end` | boolean | required | `false` | True after the owner cancels in the Customer Portal. |
| `created_at`, `updated_at` | timestamptz | required | `now()` | |

- **PK:** `owner_id`.
- **FK:** `owner_id` → `profiles(id)` **ON DELETE CASCADE** (no account, no subscription record). `plan` → `plan_limits(plan)` **ON DELETE RESTRICT** (every plan must have its limits row, and a limits row cannot be deleted while any subscription uses it).
- **Unique:** `stripe_customer_id`, `stripe_subscription_id` — a Stripe object maps to one owner, so a webhook can find the owner without ambiguity. (Unique ignores empty values.)
- **Check:** `plan = 'free' OR stripe_subscription_id IS NOT NULL` — a Pro plan with no Stripe subscription behind it would be a bug.
- **Indexes:** the two unique indexes (they are also the webhook's lookup).

### 3.3 `plan_limits`

**Purpose:** the Free and Pro numbers, stored once in the database so triggers and `submit_booking` can read them (A6). Mirrored in `src/lib/plans.ts` for display (DB6).

| Column | Type | Required | Default | Note |
|---|---|---|---|---|
| `plan` | `plan_type` | required | — | |
| `max_workspaces` | int | required | — | Free 1, Pro 5. |
| `max_resources` | int | required | — | Free 3, Pro 25. |
| `max_monthly_bookings` | int | required | — | Free 100, Pro 1000. |

- **PK:** `plan`. **FK:** none. **Unique:** the PK.
- **Check:** each `max_*` is `> 0`. (`submit_booking` relies on the monthly limit being at least 1, section 7.3.)
- **Indexes:** the PK index. Two rows only.
- Seeded by the migration. No browser role can change it.

### 3.4 `workspaces`

**Purpose:** a place the owner manages; owns the public address and the time zone (WORK-01 to WORK-04, PUB-01).

| Column | Type | Required | Default | Note |
|---|---|---|---|---|
| `id` | uuid | required | random | |
| `owner_id` | uuid | required | — | Who owns it (one owner, D1). |
| `name` | text | required | — | |
| `description` | text | optional | `NULL` | |
| `slug` | text | required | — | The `<workspace-slug>` of `/book/<slug>`. |
| `time_zone` | text | required | **none** (DB10) | A zone name such as `Europe/London`. |
| `is_locked` | boolean | required | `false` | True when hidden and read-only after a downgrade (section 7.8). |
| `created_at`, `updated_at` | timestamptz | required | `now()` | |

- **PK:** `id`.
- **FK:** `owner_id` → `profiles(id)` **ON DELETE CASCADE** (WORK-03: deleting an account removes its workspaces).
- **Unique:** `slug` — two workspaces cannot share an address (PUB-01). `(id, owner_id)` — lets child tables prove their owner copy matches (DB3).
- **Check:** `char_length(btrim(name)) BETWEEN 1 AND 100` (WORK-01 refuses empty names); `description` at most 1000 characters; `slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'` and `char_length(slug) BETWEEN 3 AND 40` (only lowercase letters, digits and single hyphens, WORK-04).
- **Trigger checks:** `time_zone` must be a real zone name (a trigger asks Postgres, because a check constraint cannot look up the zone list). A BEFORE INSERT trigger enforces the plan's workspace limit (section 7.7).
- **Indexes:** `owner_id` (list "my workspaces", RLS); the unique `slug` index (public page lookup).

### 3.5 `resources`

**Purpose:** a bookable thing inside a workspace (RES-01 to RES-08).

| Column | Type | Required | Default | Note |
|---|---|---|---|---|
| `id` | uuid | required | random | |
| `workspace_id` | uuid | required | — | |
| `owner_id` | uuid | required | — | Copy of the workspace's owner (DB3). |
| `name` | text | required | — | |
| `description` | text | optional | `NULL` | |
| `image_path` | text | optional | `NULL` | Path of the file in Storage (D9). |
| `is_available` | boolean | required | `true` | The owner's on/off switch (RES-06). |
| `is_locked` | boolean | required | `false` | Downgrade lock (section 7.8). |
| `slot_minutes` | int | required | **none** | Fixed slot length (RES-07: the owner must choose one). |
| `capacity` | int | required | **none** | Most people in one booking (RES-08). |
| `created_at`, `updated_at` | timestamptz | required | `now()` | |

- **PK:** `id`.
- **FK:** `(workspace_id, owner_id)` → `workspaces(id, owner_id)` **ON DELETE CASCADE**. Deleting a workspace deletes its resources (D13). Because the pair must match, a resource can never carry a different owner than its workspace.
- **Unique:** `(id, owner_id)` for the bookings table's matching foreign key.
- **Check:** `char_length(btrim(name)) BETWEEN 1 AND 100`; `description` ≤ 1000; `slot_minutes BETWEEN 5 AND 1440` (zero, negative or silly values refused, RES-07); `capacity BETWEEN 1 AND 1000` (RES-08).
- **Trigger checks:** BEFORE INSERT enforces the plan's resource limit (section 7.7).
- **Indexes:** `workspace_id` (list a workspace's resources, public page); `owner_id` (owner-wide counts and RLS).

### 3.6 `resource_availability`

**Purpose:** on which weekdays a resource is open, and the opening and closing clock time. One row per **open** weekday; a missing row means closed that day (AVAIL-01, AVAIL-02).

| Column | Type | Required | Default | Note |
|---|---|---|---|---|
| `id` | uuid | required | random | |
| `resource_id` | uuid | required | — | |
| `weekday` | smallint | required | — | ISO numbering: 1 = Monday … 7 = Sunday (DB9). |
| `opens_at` | time | required | — | Wall-clock time in the workspace's zone. |
| `closes_at` | time | required | — | `24:00` is allowed and means midnight. |

- **PK:** `id`.
- **FK:** `resource_id` → `resources(id)` **ON DELETE CASCADE** (the schedule is meaningless without the resource).
- **Unique:** `(resource_id, weekday)` — one opening window per weekday (DB9). This also serves as the lookup index.
- **Check:** `weekday BETWEEN 1 AND 7`; `closes_at > opens_at` (AVAIL-02).
- **Indexes:** the unique index above.

### 3.7 `bookings`

**Purpose:** booking requests from visitors (PUB-06, BOOK-01 to BOOK-08). Visitor details here are private to the owner (ISO-03).

| Column | Type | Required | Default | Note |
|---|---|---|---|---|
| `id` | uuid | required | random | |
| `resource_id` | uuid | required | — | |
| `owner_id` | uuid | required | — | Copy of the resource's owner (DB3). |
| `visitor_name` | text | required | — | |
| `visitor_email` | text | required | — | |
| `visitor_phone` | text | optional | `NULL` | |
| `note` | text | optional | `NULL` | |
| `attendees` | int | required | — | |
| `starts_at` | timestamptz | required | — | Exact moment the slot starts. |
| `ends_at` | timestamptz | required | — | Exact moment the slot ends; computed by `submit_booking`. |
| `status` | `booking_status` | required | `'pending'` | `pending`, `approved`, `rejected`, `cancelled`. |
| `status_token_hash` | bytea | required | — | SHA-256 hash of the visitor's status code (section 7.5). |
| `created_at`, `updated_at` | timestamptz | required | `now()` | |

- **PK:** `id`.
- **FK:** `(resource_id, owner_id)` → `resources(id, owner_id)` **ON DELETE CASCADE**. Deleting a resource (or its workspace, or the account) deletes its bookings (D13). The monthly count is *not* affected because it is stored elsewhere (D19).
- **Unique:** `status_token_hash` — one booking per status link; also the lookup index for the status page.
- **Check:** `ends_at > starts_at`; `attendees >= 1` (the upper bound is the resource's capacity, which is another table, so `submit_booking` checks it); `char_length(btrim(visitor_name)) BETWEEN 1 AND 100`; `char_length(visitor_email) BETWEEN 3 AND 254` and contains `@`; `visitor_phone` ≤ 30; `note` ≤ 1000; `octet_length(status_token_hash) = 32` (a SHA-256 hash is always 32 bytes).
- **Exclusion constraint (the double-booking rule):**
  `EXCLUDE USING gist (resource_id WITH =, tstzrange(starts_at, ends_at, '[)') WITH &&) WHERE (status IN ('pending','approved'))` — section 7.1.
- **Trigger checks:** BEFORE UPDATE allows only the status changes of section 1.4 of the requirements (section 7.7).
- **Indexes:**
  - The exclusion constraint's own index on `(resource_id, time range)` — it also speeds up "which slots are taken?" for the public page.
  - `(owner_id, created_at DESC, id DESC)` — the owner's booking list, newest first, 20 per page (BOOK-01, PERF-02), and daily charts.
  - `(owner_id, status)` — status filter and dashboard counts (BOOK-07, DASH-04, NOTIF-02 badge).
  - `(resource_id)` — cascade deletes and the "resource usage" chart (ANLT-04).
  - The unique index on `status_token_hash`.
- **Search** (BOOK-08) is a plain `ILIKE` on name, email and the resource's name; no special index (DB13, section 4.3).

### 3.8 `monthly_usage`

**Purpose:** how many booking requests each owner received in each UTC month. It exists because D13 (deletes are permanent) and D19 (deleted requests still count) cannot both be met by counting bookings (A7).

| Column | Type | Required | Default | Note |
|---|---|---|---|---|
| `owner_id` | uuid | required | — | |
| `month` | date | required | — | The **first day** of the UTC month, for example `2026-11-01`. |
| `booking_count` | int | required | `0` | |
| `updated_at` | timestamptz | required | `now()` | |

- **PK:** `(owner_id, month)` — one counter per owner per month; also the lookup index.
- **FK:** `owner_id` → `profiles(id)` **ON DELETE CASCADE**. Deliberately *no* link to bookings, resources or workspaces.
- **Check:** `booking_count >= 0`; `month = date_trunc('month', month)::date` (it must be a first-of-month date).
- **Indexes:** the PK index.
- No row for a month means a count of 0, so nothing has to run on the 1st (section 7.3).

### 3.9 `rate_limit_attempts`

**Purpose:** short-lived records used to limit the public form to 5 requests per 10 minutes per visitor per workspace (SEC-06, D24, A9).

| Column | Type | Required | Default | Note |
|---|---|---|---|---|
| `id` | bigint | required | identity | Auto-numbered. |
| `workspace_id` | uuid | required | — | Which workspace the attempt was for. |
| `ip_hash` | bytea | required | — | Keyed hash of the visitor's IP made in Node (DB11). The IP itself is never stored. |
| `attempted_at` | timestamptz | required | `now()` | |

- **PK:** `id`.
- **FK:** `workspace_id` → `workspaces(id)` **ON DELETE CASCADE** (a deleted workspace needs no records).
- **Check:** `octet_length(ip_hash) = 32`.
- **Indexes:** `(workspace_id, ip_hash, attempted_at)` — the "how many recent attempts?" count; `(attempted_at)` — the old-record clean-up.
- **No browser role can touch this table** (section 6).

### 3.10 `stripe_events`

**Purpose:** remembers which Stripe webhook messages were handled so a repeat does nothing (BILL-05, A14).

| Column | Type | Required | Default | Note |
|---|---|---|---|---|
| `event_id` | text | required | — | Stripe's ID, such as `evt_123…`. |
| `event_type` | text | required | — | Such as `customer.subscription.updated`. |
| `received_at` | timestamptz | required | `now()` | |
| `processed_at` | timestamptz | optional | `NULL` | Empty until the handler finishes (section 7.6). |

- **PK:** `event_id` (a second insert of the same ID is refused — that is the whole point).
- **FK:** none. **Check:** none. **Indexes:** the PK index; `received_at` for the 30-day clean-up (DB12).
- **No browser role can touch this table.**

### 3.11 `embed_configurations`

**Purpose:** the widget's saved options for a workspace (EMBED-03 to EMBED-05, A13).

| Column | Type | Required | Default | Note |
|---|---|---|---|---|
| `workspace_id` | uuid | required | — | |
| `theme` | `embed_theme` | required | `'light'` | `light` or `dark`. |
| `layout` | `embed_layout` | required | `'list'` | `list` or `grid` (D26). |
| `background_color` | text | optional | `NULL` | `NULL` = the theme's default. |
| `updated_at` | timestamptz | required | `now()` | |

- **PK / FK:** `workspace_id` → `workspaces(id)` **ON DELETE CASCADE** — exactly one row per workspace, removed with it (WORK-03).
- **Check:** `background_color ~ '^#[0-9a-fA-F]{6}$'` — only a plain hex colour code, never anything that could carry script (SEC-02).
- **Trigger checks:** a default row is created automatically with each new workspace. A Free owner cannot *change to* a Pro-only value (`grid`, or a background colour); leftover Pro values after a downgrade are kept but ignored when the widget is built (section 7.7).
- **Indexes:** the PK index.

---

## 4. Enums, functions and triggers

### 4.1 Enums (DB14)

| Enum | Values |
|---|---|
| `plan_type` | `free`, `pro` |
| `booking_status` | `pending`, `approved`, `rejected`, `cancelled` |
| `embed_theme` | `light`, `dark` |
| `embed_layout` | `list`, `grid` |

Enums make the generated TypeScript types exact unions. Adding a value later is easy; removing one is not, which is acceptable for these stable lists.

### 4.2 Extensions

**Exactly one extension is needed: `btree_gist`** (for the exclusion constraint, so a `uuid` equality and a time-range overlap can share one index). It ships with Postgres and is available on Supabase cloud. `gen_random_uuid()`, range types, time zones, `ILIKE` and `sha256` are built in. **Not used:** `pg_trgm`, `pgcrypto`, `unaccent`, `pgTAP`, `pg_cron` (DB13).

### 4.3 Search (DB13 — confirmed)

Booking search uses plain `ILIKE '%text%'` on visitor name, visitor email and resource name, always filtered by `owner_id` first. A per-owner list is small (at most 1,000 requests a month on Pro), so a sequential scan within one owner's rows is fast enough. If the optional 1,000-booking test (PERF-02) misses the 3-second target, adding `pg_trgm` becomes a **new** decision. Nothing extra is installed now.

### 4.4 Functions and triggers

All are created in the `public` schema, and all follow the rules in section 6.

| Name | Kind | What it does |
|---|---|---|
| `set_updated_at()` | trigger | Sets `updated_at = now()` on update. |
| `handle_new_user()` | trigger on `auth.users` (after insert) | Creates the owner's `profiles` row and a Free `subscriptions` row. |
| `handle_new_workspace()` | trigger (after insert on `workspaces`) | Creates the default `embed_configurations` row. |
| `validate_time_zone()` | trigger (before insert/update of `workspaces.time_zone`) | Refuses names that are not real time zones. |
| `current_plan(owner)` | helper | Returns `pro` only if `plan = 'pro'` and `status` is `active` or `trialing` (DB7), otherwise `free`. |
| `enforce_workspace_limit()` / `enforce_resource_limit()` | trigger (before insert) | Locks the owner's profile row, counts, compares with `plan_limits`, refuses over the limit. |
| `enforce_booking_transition()` | trigger (before update of `status`) | Allows only the three permitted status changes, for every role. |
| `enforce_embed_plan_rules()` | trigger (before insert/update on `embed_configurations`) | Blocks a Free owner from changing to Pro-only values. |
| `reconcile_locks(owner)` | function, also fired by a trigger on `subscriptions` and after deletes | Applies or lifts the downgrade lock (section 7.8). |
| `apply_downgrade_selection(owner, workspace, resources)` | function | Applies the owner's validated selection atomically; callable only by `service_role` (section 7.8). |
| `submit_booking(...)` | function | The whole booking submission (section 7.2). |
| `check_rate_limit(workspace, ip_hash)` | function | Records an attempt, counts recent ones, answers allowed / not allowed (section 7.4). |
| `claim_stripe_event(id, type)` / `mark_stripe_event_processed(id)` | functions | Webhook memory (section 7.6). |

---

## 5. Row Level Security

### 5.1 The rules

1. **RLS is enabled on every table in `public`**: `profiles`, `subscriptions`, `plan_limits`, `workspaces`, `resources`, `resource_availability`, `bookings`, `monthly_usage`, `rate_limit_attempts`, `stripe_events`, `embed_configurations`. A migration check (section 10) fails if any table has RLS off.
2. **Visitors have no database permissions at all** (A4). The public pages, the widget, the status page and the booking submission are served by our server code using the secret key (`service_role`), which skips RLS and returns only the fields ISO-02 allows. The public key (`anon`) is useless on its own. The server-only secret key is used in exactly six approved areas: public reads, booking submission, the rate limit, the Stripe webhook, resource image uploads (S1), and saving the owner's downgrade selection (S2, section 7.8).
3. **Two layers.** First *privileges* (can this role touch the table or column at all?), then *RLS* (which rows?). Supabase tends to hand new tables broad default privileges, so our migration states them explicitly: `REVOKE ALL` on every table and sequence from `anon` and `authenticated`, change the default privileges so future objects start closed, then `GRANT` back only what is listed below.
4. **Policies are written for the `authenticated` role** and compare against `(select auth.uid())` — the logged-in owner's ID. Wrapping it in `select` lets Postgres evaluate it once per query instead of once per row.
5. **Column-level grants** restrict what an owner can change. For example an owner may update a booking's `status` but no other booking column, and may never write `is_locked`, `owner_id`, `plan` or any usage count.

### 5.2 Who can do what

"Owner" = a logged-in owner using their own login (RLS applies). "Visitor via server" = a visitor, served by our server code with the secret key. "Anonymous" = anyone calling Supabase directly with only the public key.

| Table | Owner (own rows only) | Visitor via server code | Anonymous (public key only) |
|---|---|---|---|
| `profiles` | Read own row. | Nothing. | Nothing. |
| `subscriptions` | **Read** own row. No insert, update or delete. | Nothing. (The Stripe webhook, not a visitor, writes it.) | Nothing. |
| `plan_limits` | Read (two rows of plain numbers, nothing private). | Nothing. | Nothing. |
| `workspaces` | Read, create (within plan limit), edit name/description/slug/time zone **unless locked**, delete (even if locked). Cannot write `is_locked` or `owner_id`. | Read name, description, slug, time zone of an existing, unlocked workspace. | Nothing. |
| `resources` | Read, create (within limit, not into a locked workspace), edit **unless locked**, delete. Cannot write `is_locked`, `owner_id`, `workspace_id`. | Read name, description, image, capacity, slot length of resources that are available and unlocked. | Nothing. |
| `resource_availability` | Read; create, edit, delete for own resources **unless locked**. | Read the schedule of an available, unlocked resource (to compute slots). | Nothing. |
| `bookings` | Read own. Change **only** `status`, and only along the allowed path, **unless locked**. Delete own (**unless locked**). **Cannot insert.** | Create **only** through `submit_booking`. Read taken time ranges with no personal details (ISO-03). Read one booking's resource, time, name and status by status-token hash. Cannot edit or delete. | Nothing. |
| `monthly_usage` | Read own counts. Cannot write. | Counter raised only inside `submit_booking`; "limit reached" can be read. | Nothing. |
| `rate_limit_attempts` | **No access.** | Only through `check_rate_limit`. | **No access.** |
| `stripe_events` | **No access.** | Not involved. The webhook handler (secret key) uses the two functions. | **No access.** |
| `embed_configurations` | Read own; edit theme/layout/background of own workspace **unless locked** (Pro-only values only if Pro). No insert or delete (the row is automatic). | Read the options of an existing, unlocked workspace to build the widget. | Nothing. |

"Locked" means the downgrade state of section 7.8.

### 5.3 Policy sketch (explanatory, not run)

```sql
-- workspaces: an owner sees only their own rows
create policy "owner reads own workspaces" on public.workspaces
  for select to authenticated
  using (owner_id = (select auth.uid()));

-- workspaces: edit own rows, but not while locked
create policy "owner updates own unlocked workspaces" on public.workspaces
  for update to authenticated
  using (owner_id = (select auth.uid()) and not is_locked)
  with check (owner_id = (select auth.uid()) and not is_locked);
```

The `USING` part says which existing rows the policy applies to. The `WITH CHECK` part says what the row must look like after the change.

### 5.4 Storage (resource images)

Images live in a publicly readable Storage bucket `resource-images`. The bucket allows JPG, PNG and WebP files up to 2 MB (D9, RES-05). Uploads go through server-side application code only: the server validates the actual file type and size, verifies the owner and resource, then writes using the service-role key. The key is server-only and is never exposed to browser code. No browser role has a Storage write policy. Image uploads are the fifth of the six approved service-role usage areas; the sixth is saving the downgrade selection (A4; section 5.1).

---

## 6. Function and table access

This section is a hard rule for the migrations. It exists because Supabase, by default, lets `anon` and `authenticated` call any function in `public` through its web API, and Postgres lets everyone (`PUBLIC`) execute any new function. A powerful `SECURITY DEFINER` function left in that state would let a stranger with the public key call it.

### 6.1 Rules for every function

1. `submit_booking` and **every other server-only function**, including the protected downgrade-selection function, must, in the migration that creates it, **explicitly revoke `EXECUTE` from `PUBLIC`, `anon` and `authenticated`**, and then grant `EXECUTE` to `service_role` only.
   ```sql
   revoke execute on function public.submit_booking(/* arguments */) from public, anon, authenticated;
   grant  execute on function public.submit_booking(/* arguments */) to service_role;
   ```
2. Every function sets a **fixed `search_path`**: `SET search_path = ''`, and refers to every object with its schema name (`public.bookings`, `pg_catalog.now()`). No function relies on the caller's `search_path`.
3. `SECURITY DEFINER` is used only where the function must do what the caller may not (`submit_booking`, `check_rate_limit`, the limit triggers, `handle_new_user`, `reconcile_locks`). Each such function validates its own inputs and returns or changes only what it must.
4. The migration also changes the **default privileges** so a function added later starts with no access for `PUBLIC`, `anon` and `authenticated`. Forgetting step 1 then fails closed (nobody can call it) instead of open.
5. Trigger functions are not callable through the web API as normal functions, but get the same revoke and `search_path` treatment, for the same fail-closed reason.
6. A test (section 10) lists every function in `public` and fails if any is executable by `anon` or `authenticated` without being on an explicit allow-list in this document. The allow-list is currently **empty**.

### 6.2 Who may call what

| Function | `anon` | `authenticated` (owner) | `service_role` (our server) |
|---|---|---|---|
| `submit_booking` | no | no | yes |
| `check_rate_limit` | no | no | yes |
| `claim_stripe_event`, `mark_stripe_event_processed` | no | no | yes |
| `reconcile_locks` | no | no | yes (also run by triggers) |
| `apply_downgrade_selection` | no | no | yes |
| `current_plan` | no | no | yes |
| All trigger functions | no | no | no direct calls needed |

### 6.3 Tables never reachable by browser roles

| Table | `anon` | `authenticated` | Who can use it |
|---|---|---|---|
| `rate_limit_attempts` | no privileges | no privileges | `check_rate_limit` only |
| `stripe_events` | no privileges | no privileges | the two Stripe-event functions only |

And these are reachable by a logged-in owner only as **read-only** (own rows): `profiles`, `subscriptions`, `monthly_usage`, `plan_limits`. For `anon`, **every** table is closed. `auth.users` is managed by Supabase and is never exposed to our own queries.

Only the `public` schema is exposed through Supabase's web API; nothing else we create is.

---

## 7. Special designs

### 7.1 Double-booking prevention (AVAIL-04, PERF-03)

**The race condition.** Imagine a function that does two steps: (1) "is this slot free?" and (2) "save the booking". Two visitors, Ana and Ben, both press Submit for the same slot at the same moment:

```
Ana: step 1  asks "is 10:00 free?"  -> yes
Ben: step 1  asks "is 10:00 free?"  -> yes     (Ana has not saved yet)
Ana: step 2  saves her booking
Ben: step 2  saves his booking                 -> two bookings for 10:00
```

Each check was correct when it ran; the bug is the gap between checking and saving. Checking in server code, or inside a function, cannot close that gap on its own.

**The fix: a rule the database applies at the moment of saving.**

```sql
-- sketch, not run
alter table public.bookings
  add constraint bookings_no_overlap
  exclude using gist (
    resource_id WITH =,
    tstzrange(starts_at, ends_at, '[)') WITH &&
  ) where (status in ('pending', 'approved'));
```

Plain reading: *"for the same resource, no two pending-or-approved bookings may have time ranges that overlap."*

- Postgres checks this while inserting, using an index. If Ana's row is saved but not yet committed, Ben's insert **waits** for her. When she commits, Ben's insert fails with error `23P01` (exclusion violation); if she rolls back, Ben's succeeds. Exactly one wins, always (PERF-03).
- `'[)'` means the range includes its start and excludes its end, so a booking 10:00–11:00 and another 11:00–12:00 do **not** overlap.
- The `WHERE` makes rejected and cancelled bookings invisible to the rule, so their slot is free again (D10, BOOK-04, BOOK-05). A deleted booking is gone entirely.
- It is an *overlap* rule, not "same start time". If an owner later changes a resource's slot length, old and new bookings still cannot overlap.
- Statuses only move forward (section 7.7), so a rejected or cancelled booking can never be re-activated and cause a late conflict. Approving a pending booking changes nothing for the rule: both statuses already hold the slot.
- The slot-checking inside `submit_booking` stays: it gives friendly messages and rejects invalid slots. The constraint is the guarantee (DB4).

### 7.2 The booking submission function (A5, DB5)

`public.submit_booking(...)` is called by the Server Action after the rate limit and `zod` validation. The server passes only what the visitor chose; the database computes everything else.

**Inputs:** resource ID, `starts_at` (timestamptz), visitor name, email, optional phone, optional note, attendees, and the `status_token_hash` (the server made the random code and hashed it, section 7.5).
**Properties:** `SECURITY DEFINER`, `SET search_path = ''`, `EXECUTE` for `service_role` only (section 6). The whole call is one transaction.

Steps, in order:

1. **Load** the resource, its workspace (slug, time zone, locked flag) and the owner's ID, in one query. No row → error `not_bookable`.
2. **Bookable?** The resource must have `is_available = true`, and neither the resource nor its workspace may be locked (RES-06, BILL-09). Otherwise → `not_bookable`.
3. **Convert to the workspace's clock.** Compute the local start: `starts_at AT TIME ZONE time_zone`. Convert back and require the same instant; if not, that local time does not exist (the skipped hour when clocks go forward) or is the second copy of a repeated hour → `invalid_slot` (ARCHITECTURE 5.4).
4. **Valid slot?** Find the `resource_availability` row for that local date's ISO weekday. No row → `invalid_slot`. Then require the local time ≥ `opens_at`, the local time + `slot_minutes` ≤ `closes_at`, and the distance from `opens_at` to be an exact multiple of `slot_minutes` (AVAIL-01 to AVAIL-03, AVAIL-05).
5. **Compute `ends_at`** as the local start plus `slot_minutes`, converted back to an exact moment. The visitor cannot send their own end time.
6. **Not in the past, not too far ahead:** `starts_at > now()` and the local date ≤ today (in the workspace's zone) + 90 days → otherwise `past` or `too_far` (D8). "Now" is the database server's clock.
7. **Attendees:** between 1 and the resource's `capacity` → otherwise `too_many_attendees` (RES-08, PUB-04).
8. **Monthly limit and count, atomically.** Look up the owner's plan limit (`current_plan` + `plan_limits`) and run one statement:
   `INSERT INTO monthly_usage (owner_id, month, booking_count) VALUES (owner, first-of-UTC-month, 1) ON CONFLICT (owner_id, month) DO UPDATE SET booking_count = monthly_usage.booking_count + 1 WHERE monthly_usage.booking_count < <limit> RETURNING booking_count`.
   No row returned → the limit is reached → error `limit_reached` (BILL-07, PUB-06). See section 7.3.
9. **Insert** the booking with status `pending` and the token hash (PUB-06).
10. **Overlap?** If the insert hits the exclusion constraint (`23P01`), the function raises `slot_taken`. Raising an error undoes the *whole* call, **including the +1 from step 8**, so a refused request never uses up allowance (ARCHITECTURE 4.2).
11. **Return** the new booking's ID, `starts_at` and `ends_at`. The Server Action redirects to `/booking/<code>`.

Errors are raised as `RAISE EXCEPTION` with a short fixed message (`slot_taken`, `limit_reached`, `not_bookable`, `invalid_slot`, `past`, `too_far`, `too_many_attendees`). The Server Action maps each to its friendly message (AVAIL-05).

The usage row is locked from step 8 until the transaction ends, which is a few milliseconds; submissions of the same owner queue briefly and submissions of different owners never interfere.

### 7.3 The monthly usage counter (A7, D19)

- **One row per owner per UTC month** in `monthly_usage` (section 3.8). The month key is `date_trunc('month', now() AT TIME ZONE 'UTC')::date`.
- **Raised only in `submit_booking`**, in the same transaction as the booking insert. Nothing lowers it, so deleting a booking, resource, or workspace changes nothing (D13 + D19, BOOK-06).
- **Why one statement is race-proof.** The `INSERT … ON CONFLICT DO UPDATE … WHERE count < limit` locks the row, and a second request waits for the first, then re-checks the `WHERE` with the new value. If one place is left, exactly one of two simultaneous requests gets it.
- **No reset job.** A new month simply has no row; the first request creates it with 1. "No row" reads as 0.
- **Limit source:** the owner's plan *at that moment* (`current_plan`), so an upgrade mid-month raises the limit immediately (ARCHITECTURE 6.1). `plan_limits.max_monthly_bookings` is checked to be at least 1, which the first-insert path relies on.
- **Readers:** the billing page and the public "not accepting requests" message read the row through server code.

### 7.4 Rate-limit records with a hashed IP per workspace (A9, D24, SEC-06)

- **Stored:** `workspace_id`, `ip_hash`, `attempted_at` (section 3.9). The Node server computes `ip_hash = HMAC-SHA256(RATE_LIMIT_SECRET, ip)` (DB11). The database never sees the IP or the secret; without the secret nobody can reverse the hashes to addresses. Nothing links a record to a booking, name or email.
- **`check_rate_limit(workspace_id, ip_hash)`** does, in one call: (1) delete records older than 10 minutes; (2) insert this attempt; (3) count this `ip_hash` + this `workspace_id` in the last 10 minutes; (4) return *allowed* if the count is 5 or fewer, *refused* otherwise.
- **Every attempt is recorded, including refused ones** (A9b), so a flood keeps being refused.
- **Per visitor per workspace:** the count filters on both columns, so attempts at workspace X never reduce the allowance for workspace Y (A9c).
- **Never counts against the owner's monthly limit:** this function runs before `submit_booking` and touches `monthly_usage` not at all (SEC-06).
- **Clean-up is built in:** step 1 above; no scheduled job (A9d).
- **Two simultaneous attempts** may each see the other's record and both be refused at exactly the boundary. That errs on the safe side and is accepted.
- **Access:** table closed to all browser roles; function callable by `service_role` only (section 6).

### 7.5 The status token hash (A8, NOTIF-03)

- The Server Action creates a random 256-bit code with the secure random generator, computes its SHA-256 hash (32 bytes) in Node, and passes **only the hash** to `submit_booking`. The code itself is never stored anywhere in the database.
- `bookings.status_token_hash` is `bytea`, `NOT NULL`, `UNIQUE`, with a length-32 check.
- To open `/booking/<code>`, the server hashes the code from the address and looks for a booking with that hash through server code. No match → "not found". The page returns only resource, date, time, the visitor's name and the status — never email, phone or note (ISO-03).
- Because the code is long and random, an unsalted fast hash is sufficient: there is nothing to guess. A leaked database would not reveal working links.
- Deleting the booking removes the row and the hash, so the link then says "not found" (NOTIF-03).

### 7.6 Remembered Stripe webhook IDs (A14, BILL-05, DB12)

1. After checking the Stripe signature, the handler calls `claim_stripe_event(event_id, type)`.
2. The function tries `INSERT … ON CONFLICT DO NOTHING`:
   - Inserted → returns **`claimed`**: process it.
   - Already there with `processed_at` set → returns **`duplicate`**: do nothing, reply 200.
   - Already there but `processed_at` empty (an earlier try crashed halfway) → returns **`claimed`** so Stripe's retry can finish the job.
3. The handler asks Stripe for the subscription's *current* state, saves it to `subscriptions`, then calls `mark_stripe_event_processed(event_id)`.
4. Because the saved data always comes from Stripe's current answer, handling a message twice, or two copies at once, ends in the same state. Out-of-order messages cannot leave stale data either.
5. During later webhooks, rows older than 30 days are deleted. There is no scheduled job.

### 7.7 Plan limits, allowed status changes and the read-only subscription (A6)

**Plan limits (BILL-07).** A `BEFORE INSERT` trigger on `workspaces` and on `resources`:

1. `SELECT … FROM profiles WHERE id = NEW.owner_id FOR UPDATE` — locks the owner's profile row, so two create requests from the same owner run one after the other. (Without this lock, two parallel creates could each count "2 of 3" and both succeed, ending at 4 of 3.)
2. Counts the owner's existing workspaces (or resources), **including locked ones**.
3. Compares with `plan_limits` for `current_plan(owner)`; at or over the limit → raise a clear error that the server turns into the "upgrade" message.

This holds even for a request that skips our web pages, because it lives in the table, not in server code. The server still checks first to show a friendly message; the trigger is the guarantee. `lib/plans.ts` holds the same numbers for display, and a test must verify it matches `plan_limits` (DB6, section 10).

**Allowed status changes.** A `BEFORE UPDATE OF status` trigger on `bookings` allows only `pending → approved`, `pending → rejected`, `approved → cancelled`; everything else raises an error (BOOK-03 to BOOK-05). It applies to **every** role, including our own server. Combined with **column-level privileges** (owners may update only the `status` column), an owner cannot alter a visitor's name, the booking time, or move a booking to another resource, even by calling the database directly.

**Read-only subscription (BILL-06).** For `subscriptions`:

- `authenticated` has `SELECT` and nothing else; there is no insert, update or delete privilege and no such policy.
- The select policy shows only `owner_id = (select auth.uid())`.
- `anon` has nothing.
- The row is created by `handle_new_user()` and changed only by the Stripe webhook running as `service_role`.
- `plan` changes only from a verified webhook (A14). `current_plan()` ignores `current_period_end`: if a webhook is late, the owner stays Pro until Stripe says otherwise.

**Pro-only widget values.** A trigger on `embed_configurations` refuses a Free owner *changing to* `layout = 'grid'` or setting a `background_color`. Leftover Pro values after a downgrade are kept, so they return on upgrade, but the server ignores them when building the widget (EMBED-05).

**Which subscriptions count as Pro (DB7).** `current_plan()` returns `pro` only when `plan = 'pro'` **and** `status IN ('active','trialing')`.
> **Known limitation — `past_due` loses Pro immediately.** If a card payment fails, Stripe marks the subscription `past_due` while it retries, and SlotMate treats the owner as Free (with the downgrade lock of section 7.8) straight away, without a grace period. We accept this for version 1 for simplicity. Allowing `past_due` to keep Pro would be a one-line change in `current_plan()` plus a decision.

### 7.8 Locked or read-only state on downgrade (D20, A18, DB8)

When Pro ends, nothing is deleted (BILL-09). If the owner is over the Free limits (more than 1 workspace or 3 resources), the owner selects one workspace and three resources to remain active in the dashboard. A Next.js Server Action validates that the selection belongs to the owner and fits the plan limits, then invokes a protected database function using the server-only service-role key. The database function is executable only by `service_role` (section 6). No oldest-first or other automatic selection is permitted.

- **Columns:** `workspaces.is_locked` and `resources.is_locked`, default `false`. Owners cannot write them (column privileges).
- **No separate selection table.** The selection is not stored anywhere else. After `apply_downgrade_selection` runs, the selection simply *is* the set of workspaces and resources left with `is_locked = false`.
- **Valid selection (precise definition).** The owner's unlocked items form a valid selection only when **all** of these hold:
  1. exactly **one** of the owner's workspaces has `is_locked = false`;
  2. **at most three** of the owner's resources have `is_locked = false`;
  3. every unlocked resource belongs to that one unlocked workspace.

  An **empty** unlocked set (every workspace and resource locked) is **not** a valid selection. It is the safe state, waiting for the owner to choose.
- **Setting the lock.** A trigger on `subscriptions` calls `reconcile_locks(owner)` whenever the plan or status changes. `reconcile_locks` **never re-selects**: it never chooses which items to keep and never unlocks a subset. It only locks items when the owner is over the plan limits **and** no valid selection exists (as defined above). If a valid selection exists, it leaves it untouched. Until the owner makes a valid selection, the safe state is that all affected workspaces and resources are locked/read-only and unavailable publicly; the dashboard asks the owner to choose. The system never guesses which items to keep.
- **Selected resources must belong to the selected workspace (DB17).** `apply_downgrade_selection` refuses the whole selection, changing nothing, if any of the three selected resources is not in the selected workspace.
- **Effect of a lock:**
  - the public page and widget do not show it, and `submit_booking` refuses it (step 2);
  - RLS lets the owner **read** it but not **update** it, nor change its availability, embed options or its bookings' statuses;
  - the owner may still **delete** it, which is the way to get back within the limits;
  - it still counts toward the plan limit, so the owner cannot create new items past the limit while locked items exist.
- **Lifting the lock.** `reconcile_locks` sets all `is_locked` back to `false` when the owner is within their plan's limits: after an upgrade (via the subscription trigger), or after deleting enough items (via after-delete triggers on `workspaces` and `resources`).
- Existing pending bookings on a locked resource stay as they are; they are read-only too.
- The dashboard selection is required. The Server Action checks ownership and plan limits before calling the protected function; the function trusts only the server role and applies the supplied selection atomically. If a selection is invalid or absent, no items are unlocked.

### 7.9 Time (A10, D7)

| Data | Stored as | Rule |
|---|---|---|
| Booking start and end, `created_at`, `updated_at`, `attempted_at`, `current_period_end`, `processed_at` | **`timestamptz`** (Postgres stores UTC) | Every moment of time in the database is a `timestamptz`. There is no `timestamp without time zone` column. |
| Opening and closing hours | **`time`** (clock time, no zone) in `resource_availability` | "Opens at 09:00" stays 09:00 on the wall all year, including after clocks change. |
| Workspace time zone | **`text`**, a zone *name* such as `Europe/London` | A name knows about summer time; a fixed offset does not. Validated by a trigger against Postgres's list of zones. |
| Monthly usage month | **`date`**, first day of the **UTC** month | The one deliberate exception to "everything in the workspace's zone" (D19). |

How the pieces meet: `submit_booking` converts the visitor's chosen instant to the workspace's local clock, compares it with the `time` values, and converts the end back to an instant (section 7.2, steps 3–5). Display and charting by workspace zone happen in the app (ARCHITECTURE 5.3, A12).

**DB10 (restated in full): the workspace time zone is required, with no default in the database.** `workspaces.time_zone` is `NOT NULL` and has **no** `DEFAULT`. The create-workspace form pre-fills the owner's browser time zone as a suggestion, which the owner can change from a list; the server then sends an explicit value. If a request arrives without one, the insert fails rather than silently picking UTC or any other zone. Reasons: WORK-04 requires a workspace to have a time zone "from the start"; every slot calculation depends on it; and a silent default would make every slot a few hours wrong for owners who never noticed it. The trigger in section 4.4 rejects anything that is not a real zone name. Changing the zone later is allowed, keeps existing bookings' exact moments, and shows a warning first (A11).

---

## 8. Decision on `workspace_members` (DB1)

**Decision: drop it. SlotMate has no `workspace_members` table.** The master prompt (section 5) lists it as an entity to *consider*; it does not require it.

Why it is dropped despite being in the master prompt:

1. **Decision D1 says one owner per workspace, with team invites out of scope** (requirements: ROLE-01, out-of-scope list). A members table exists to record *several people per workspace* and their roles. With exactly one owner, every row would say the same thing as `workspaces.owner_id`.
2. **It would store the same fact twice.** An owner/member row and `owner_id` could disagree (after a bug or a manual edit), and then someone might see or be denied a workspace wrongly. A single column cannot disagree with itself.
3. **It makes data isolation harder to get right.** Every RLS policy, every count and every limit would have to join through members. The simple rule "`owner_id` equals the logged-in user" is the easiest policy to read and to test for ISO-01.
4. **Nothing in the requirements reads it.** No requirement mentions members, invitations or roles; a table with no use is a table that can be misused.
5. **It is cheap to add later.** If teams are ever approved, one migration creates `workspace_members`, fills it from `owner_id`, and policies are widened. Nothing designed here blocks that.

The master prompt's intent — "ensure that one organization cannot access another organization's private information" — is met by `owner_id` on every table plus RLS (section 5). This difference from the master prompt's entity list is recorded here and should be mentioned in the project reflection.

---

## 9. Migration plan

We use only the Supabase CLI against the **Supabase cloud project** (no Docker, no local Supabase). Each file is created with `supabase migration new <name>`, which stamps it with a timestamp so the order is fixed. The files live in `supabase/migrations/` and are committed to Git (L6).

Applying a migration to the cloud project (`supabase db push`) changes a real database, so **each push is shown to the project owner first and run only after approval** (master prompt rule 14). Until then nothing is created.

| Order | File name (after the timestamp) | Contents |
|---|---|---|
| 1 | `extensions_enums_helpers` | `btree_gist`; the four enums; `set_updated_at()`; default-privilege hardening (section 6.1, rule 4). |
| 2 | `profiles_subscriptions_plan_limits` | The three tables, each with RLS enabled; seed Free and Pro limits; `handle_new_user()` and its trigger on `auth.users`; `current_plan()`. |
| 3 | `workspaces_resources_availability_embed` | `workspaces`, `resources`, `resource_availability`, `embed_configurations` with all constraints and indexes, each with RLS enabled; time-zone, new-workspace and embed triggers. |
| 4 | `bookings` | `bookings` with RLS enabled; exclusion constraint; indexes; status-transition trigger. |
| 5 | `usage_ratelimit_stripe_events` | `monthly_usage`, `rate_limit_attempts`, `stripe_events` with constraints and indexes, each with RLS enabled. |
| 6 | `functions` | Limit triggers; `submit_booking`; `check_rate_limit`; the two Stripe-event functions; `reconcile_locks` and its triggers — each with its `REVOKE`/`GRANT` and fixed `search_path`. |
| 7 | `rls_and_grants` | Revoke and re-grant privileges (column-level where listed); all policies; the Storage bucket (size and type limits) and its policies. RLS is already on (migrations 2–5); this file only confirms it. |

**RLS is enabled in the same migration that creates each table**, not saved for migration 7. A table with RLS on and no policies lets no browser role in, so every table is closed from the moment it exists, even if a later migration is delayed. Policies and grants stay together in migration 7.

After each applied migration, TypeScript types are regenerated from the cloud project with `supabase gen types typescript --linked` into `src/types/` (this needs no Docker).

Rules for migrations: never edit a migration that was already pushed (add a new one); each file is small and does one job; every file is reviewed before the push.

---

## 10. Verification plan

No local Supabase and no Docker means no local database test tools (such as pgTAP). Database tests are written as TypeScript tests run by Playwright's test runner (its `request` API can call Supabase's web API) against the **development cloud project**, using throw-away test accounts created through the Auth admin API and deleted afterwards. Nothing in this section has been run yet.

| # | Test | Expected result | Covers |
|---|---|---|---|
| T1 | **Two owners, A and B.** A tries to list, read, update and delete B's workspaces, resources, availability, bookings, embed settings, usage and subscription, using A's login directly against the database. | Zero rows returned; updates and deletes change nothing. | ISO-01 |
| T2 | **Public key only — `submit_booking`.** Call `rpc/submit_booking` with just the public key (`anon`). Repeat as a logged-in owner. | Both fail with a permission error; no booking is created and no usage counted. | section 6, ISO-02 |
| T3 | **Public key only — closed tables.** With the public key, `select` from `rate_limit_attempts`, `stripe_events` and `subscriptions`. Repeat as a logged-in owner for `rate_limit_attempts` and `stripe_events`. | Permission denied (or no rows). | section 6.3 |
| T4 | **Public key only — writes.** With the public key, `insert`, `update` and `delete` on `subscriptions`, `rate_limit_attempts`, `stripe_events`, `monthly_usage` and `bookings`. | Every write fails; row counts and values unchanged. | section 5, 6 |
| T5 | **Owner cannot write the subscription.** As owner A, try to set own `plan` to `pro`, change `status`, insert a second row, delete the row. | All fail; the plan stays `free`. | BILL-06, A6 |
| T6 | **Function permissions audit.** Query the catalog for every function in `public` and its `EXECUTE` privileges; check each has a fixed `search_path`. | None executable by `PUBLIC`, `anon` or `authenticated`; all have `search_path` set. | section 6.1 |
| T7 | **RLS audit.** Query the catalog for tables in `public` without RLS. | None. | ISO-01 |
| T8 | **Parallel booking.** With `service_role`, fire two `submit_booking` calls for the same resource and slot at the same instant; repeat 20 times. | Exactly one booking each time; the loser gets `slot_taken`; the owner's monthly count rose by exactly 1 per round. | PERF-03, AVAIL-04 |
| T9 | **Overlap rule without the function.** Insert two overlapping pending bookings directly as `service_role`. Insert back-to-back bookings. Reject the first, then book the same slot again. | Overlap refused; back-to-back allowed; slot reusable after reject. | section 7.1 |
| T10 | **Invalid slots refused by the function.** Closed weekday, outside hours, off the slot boundary, in the past, 91 days ahead, attendees above capacity, unavailable resource, the skipped hour on a clock-change day. | Each returns its specific error and creates nothing. | AVAIL-05, section 5.4 of the architecture |
| T11 | **Monthly limit.** Set a Free owner to 99 bookings, submit 2 at once, then delete one booking and submit again. | One of the two succeeds; the 101st is refused; deleting does not give allowance back; a refused request leaves the count unchanged. | BILL-07, D19 |
| T12 | **Plan limits race.** Fire parallel workspace and resource creates for a Free owner at the limit. | Never more than 1 workspace and 3 resources. Direct database inserts as owner are refused too. | BILL-01, A6 |
| T13 | **Status changes.** Try every pair of statuses as the owner, and as `service_role`. | Only the three allowed changes succeed. Owner cannot change any other booking column. | BOOK-03 to BOOK-05 |
| T14 | **Rate limit.** 6 calls for workspace X with one hash, then 1 for workspace Y with the same hash, then wait out the window. | 6th refused; Y allowed; allowed again after 10 minutes. Refused attempts never changed `monthly_usage`. | SEC-06, D24 |
| T15 | **Webhook memory.** Claim the same event twice; claim, crash before marking, claim again. | `claimed`, then `duplicate`; the crashed one is `claimed` again. | BILL-05 |
| T16 | **Downgrade lock and selection.** Give an owner 3 workspaces and 10 resources as Pro, move to Free. Verify the safe all-locked state before selection, and that a subscription change re-running `reconcile_locks` in that state neither treats the empty unlocked set as a valid selection nor unlocks anything; submit an owned selection through the Server Action; try an unowned or over-limit selection; try a selection where one of the three resources belongs to a different workspace than the selected one; then try to edit, book and delete, and upgrade. | No items are silently selected; an all-locked owner stays all-locked until they choose. A valid selection keeps exactly the selected workspace and three resources active; invalid selections fail and leave the safe state, including the mixed-workspace selection (DB17). Other items remain read-only, hidden from the public and unbookable; deleting remains available; upgrade unlocks all. | D20, BILL-09, section 7.8 |
| T17 | **Cascades.** Delete a workspace; then a resource; then an Auth user. | Children disappear; `monthly_usage` rows for the workspace delete case remain; Auth-user delete removes all of the owner's rows. | WORK-03, RES-03, D13 |
| T18 | **`lib/plans.ts` matches `plan_limits`.** A test reads both and compares every number. | Fails if either side is changed without the other. | DB6 |
| T19 | **Sign-up trigger.** Create an account through Auth. | A `profiles` row and a Free `subscriptions` row exist. | AUTH-01 |
| T20 | **Time zone.** Create a workspace with an invalid zone name; with none at all. | Both refused. | DB10, WORK-04 |
| T21 | **Image upload path.** Attempt valid and invalid image uploads through the server flow; attempt Storage writes with browser roles and check bucket reads. | JPG, PNG and WebP up to 2 MB succeed only through the server flow after ownership validation; unsupported, oversized and unauthorized uploads fail; images are publicly readable; browser writes and service-role key exposure are absent. | S1, RES-05, section 5.4 |

Results are recorded in `docs/TESTING.md` and `docs/DEVELOPMENT_LOG.md` when the tests exist (Phase 17 at the latest; T1–T8 as soon as the migrations are applied).

---

## 11. Requirement traceability

| Requirement | Backed by |
|---|---|
| ISO-01, SEC-03 | `owner_id` on every owner table, RLS on all tables, privileges (sections 5, 6) |
| ISO-02, ISO-03 | No visitor privileges; visitor data only through server code and `submit_booking` (sections 5.2, 7.5) |
| AVAIL-01 to AVAIL-03, AVAIL-05 | `resource_availability`, `submit_booking` steps 3–7 |
| AVAIL-04, PERF-03 | Exclusion constraint (section 7.1) |
| WORK-01, WORK-04 | `slug` unique and format check; `time_zone` validation |
| WORK-03, RES-03, D13 | `ON DELETE CASCADE` chain |
| RES-06 to RES-08 | `is_available`, `slot_minutes`, `capacity` checks; `submit_booking` |
| BOOK-03 to BOOK-06 | Transition trigger, column privileges, delete policy |
| BILL-01 to BILL-02, BILL-07 | `plan_limits`, limit triggers, `monthly_usage` |
| BILL-05, SEC-04 | `stripe_events` and its functions |
| BILL-06 | `subscriptions` read-only design |
| BILL-09, D20 | `is_locked` and `reconcile_locks` |
| NOTIF-02 | Index `(owner_id, status)` |
| NOTIF-03 | `status_token_hash` |
| SEC-06 | `rate_limit_attempts`, `check_rate_limit` |
| EMBED-03 to EMBED-05 | `embed_configurations`, plan-rule trigger |
| PERF-02 | Index `(owner_id, created_at DESC, id DESC)` |

---

## 12. Database decisions

All DB1–DB16 were approved by the project owner on 2026-11-12, with the changes shown in the last column. DB17 was approved on 2026-11-13. S1 and S2 are also approved decisions and are recorded below.

| # | Decision | Where | Approval note |
|---|---|---|---|
| DB1 | Drop `workspace_members`. | section 8 | Reason against the master prompt written out. |
| DB2 | Keep `profiles` with only `id` and `created_at`. | 3.1 | — |
| DB3 | Copy `owner_id` onto `resources` and `bookings`, guarded by composite foreign keys. | 3.5, 3.7 | — |
| DB4 | Double-booking guard is an exclusion constraint on time ranges. | 7.1 | — |
| DB5 | Booking submission is one `SECURITY DEFINER` function callable only by `service_role`; the database computes `ends_at`. | 7.2 | — |
| DB6 | Plan limits in a `plan_limits` table, mirrored in `src/lib/plans.ts`. | 3.3, 7.7 | **A test must verify `lib/plans.ts` matches `plan_limits` (T18).** |
| DB7 | Only `active` and `trialing` count as Pro. | 7.7 | **Recorded: `past_due` loses Pro immediately — a known limitation.** |
| DB8 | Downgrade lock through `is_locked` columns plus automatic unlock. | 7.8 | — |
| DB9 | One opening window per weekday; ISO weekdays 1–7. | 3.6 | — |
| DB10 | Time zone required, no database default. | 7.9 | **Restated in full in section 7.9.** |
| DB11 | IP fingerprint made in Node with HMAC and `RATE_LIMIT_SECRET`. | 7.4 | — |
| DB12 | Stripe events: claim first, mark processed after; delete rows older than 30 days. | 7.6 | — |
| DB13 | Search with plain `ILIKE`. | 4.3 | **Confirmed: no extra extension; the only extension is `btree_gist`.** |
| DB14 | Postgres enums for plan, status, theme, layout. | 4.1 | — |
| DB15 | Server Action deletes Storage images before deleting a workspace or resource. | 5.4 | Needed because SQL cannot safely delete stored files. |
| DB16 | One Supabase cloud project now; a second for production before deployment. | 9 | Each `db push` still needs approval. |
| DB17 | On downgrade, the three selected resources must belong to the selected workspace; `apply_downgrade_selection` refuses the selection otherwise. | 7.8 | **Tested in T16.** |

### Additional approved decisions

| # | Approved decision | Where | Notes |
|---|---|---|
| S1 | All image uploads use server-side application code and the service-role key after owner/resource validation. The public `resource-images` bucket accepts JPG, PNG and WebP up to 2 MB. Browser roles have no write policy; the key is never exposed to browser code. | 5.4, 6, 10 (T21) | Fifth of the six approved service-role usage areas listed in 5.1; the sixth is the downgrade selection (S2). |
| S2 | On Pro downgrade, the owner selects one workspace and three resources in the dashboard. A Next.js Server Action validates ownership and plan limits, then calls a protected database function using the service-role key. Function execution is revoked from `PUBLIC`, `anon` and `authenticated` and granted only to `service_role`. No automatic oldest-first selection. Until a valid selection exists, affected items remain locked/read-only and unavailable publicly. | 6, 7.8, 10 (T16) | No data is deleted; upgrading lifts locks. Sixth approved service-role usage area (5.1). |

---

## 13. What has not been verified

- **Nothing here has been run.** No SQL file exists and nothing has been applied to a database. All SQL in this document is explanatory. Syntax, names and behaviour will be proved by the migrations and the tests in section 10.
- **The Mermaid diagram.** It is written in the standard `erDiagram` syntax, but it has not been rendered by a tool yet. Open this file in GitHub's preview, VS Code with a Mermaid extension, or mermaid.live to confirm; fix any syntax error there before Phase 5.
- **Supabase defaults.** The default privileges Supabase gives new tables and functions, and whether `btree_gist` can be installed with the `uuid` operator class on the project's Postgres version, must be confirmed against the actual cloud project in migration 1.
- **Triggers on `auth.users`.** A failing trigger there blocks all sign-ups. It must be tested before anything else depends on it (T19).
- **Locking and parallel behaviour** (sections 7.1, 7.3, 7.7) follows documented Postgres behaviour, but is proved only by T8, T11 and T12.
- **Clock-change handling** in `submit_booking` (step 3) is designed, not tested (T10).
- **Supabase's built-in email limits** for creating many test accounts (ARCHITECTURE section 10) may force test accounts to be created through the Auth admin API instead of the sign-up form.
