-- =============================================================================
-- SlotMate — Migration 5: usage_ratelimit_stripe_events
--
-- Implements docs/DATABASE.md:
--   §3.8  monthly_usage        (A7, D19, §7.3)
--   §3.9  rate_limit_attempts  (A9, D24, SEC-06, §7.4)
--   §3.10 stripe_events        (A14, BILL-05, DB12, §7.6)
--
-- RLS is enabled on every table here (§9). rate_limit_attempts and
-- stripe_events will never get a browser-role grant (§6.3); they are used only
-- through their SECURITY DEFINER functions in migration 6.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. monthly_usage (§3.8, §7.3)
-- One counter per owner per UTC month. Raised only inside submit_booking,
-- never lowered. Deliberately NOT linked to bookings, resources or workspaces.
-- -----------------------------------------------------------------------------
create table public.monthly_usage (
  owner_id      uuid not null
    references public.profiles (id) on delete cascade,
  month         date not null,               -- first day of the UTC month
  booking_count integer not null default 0,
  updated_at    timestamptz not null default now(),

  constraint monthly_usage_pkey primary key (owner_id, month),

  constraint monthly_usage_booking_count_non_negative
    check (booking_count >= 0),
  -- FLAG: §3.8 writes this as month = date_trunc('month', month)::date.
  -- date_trunc on a date goes through timestamptz and depends on the session
  -- time zone; "day of month = 1" means the same thing and is time-zone-proof.
  constraint monthly_usage_month_is_first_day
    check (extract(day from month) = 1)
);

alter table public.monthly_usage enable row level security;

create trigger monthly_usage_set_updated_at
  before update on public.monthly_usage
  for each row
  execute function public.set_updated_at();


-- -----------------------------------------------------------------------------
-- 2. rate_limit_attempts (§3.9, §7.4)
-- Short-lived. ip_hash = HMAC-SHA256(RATE_LIMIT_SECRET, ip), made in Node (DB11).
-- The IP itself is never stored. Nothing links a row to a booking or a visitor.
-- -----------------------------------------------------------------------------
create table public.rate_limit_attempts (
  id           bigint generated always as identity primary key,
  workspace_id uuid not null
    references public.workspaces (id) on delete cascade,
  ip_hash      bytea not null,
  attempted_at timestamptz not null default now(),

  constraint rate_limit_attempts_ip_hash_length
    check (octet_length(ip_hash) = 32)
);

alter table public.rate_limit_attempts enable row level security;

create index rate_limit_attempts_lookup_idx
  on public.rate_limit_attempts (workspace_id, ip_hash, attempted_at);
create index rate_limit_attempts_attempted_at_idx
  on public.rate_limit_attempts (attempted_at);


-- -----------------------------------------------------------------------------
-- 3. stripe_events (§3.10, §7.6, DB12)
-- Remembers which Stripe webhook messages were handled. No FK, no check.
-- -----------------------------------------------------------------------------
create table public.stripe_events (
  event_id     text primary key,
  event_type   text not null,
  received_at  timestamptz not null default now(),
  processed_at timestamptz
);

alter table public.stripe_events enable row level security;

create index stripe_events_received_at_idx
  on public.stripe_events (received_at);
