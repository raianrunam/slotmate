-- =============================================================================
-- SlotMate — Migration 2: profiles_subscriptions_plan_limits
--
-- Implements docs/DATABASE.md:
--   §3.3  plan_limits        table + Free/Pro seed rows (DB6)
--   §3.1  profiles           table (DB2)
--   §3.2  subscriptions      table + set_updated_at trigger (DB7, §7.7)
--   §4.4  current_plan()     helper, SECURITY INVOKER, EXECUTE for service_role
--                            only (§6.1 rule 1, §6.2)
--   §4.4  handle_new_user()  SECURITY DEFINER trigger function (§6.1 rule 3)
--         + trigger on auth.users (§9 row 2)
--
-- RLS is enabled on every table here, in the migration that creates it (§9).
-- No policies and no table grants yet: those are in migration 7. Until then
-- anon and authenticated cannot reach these tables at all.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. plan_limits (§3.3)
-- Created first, because subscriptions.plan points at it.
-- -----------------------------------------------------------------------------
create table public.plan_limits (
  plan                 public.plan_type primary key,
  max_workspaces       integer not null
    constraint plan_limits_max_workspaces_positive check (max_workspaces > 0),
  max_resources        integer not null
    constraint plan_limits_max_resources_positive check (max_resources > 0),
  max_monthly_bookings integer not null
    constraint plan_limits_max_monthly_bookings_positive check (max_monthly_bookings > 0)
);

alter table public.plan_limits enable row level security;

-- Seed rows (§3.3). src/lib/plans.ts must hold the same numbers (DB6, T18).
insert into public.plan_limits (plan, max_workspaces, max_resources, max_monthly_bookings)
values
  ('free', 1,  3,  100),
  ('pro',  5, 25, 1000);


-- -----------------------------------------------------------------------------
-- 2. profiles (§3.1, DB2)
-- One row per owner. Same id as the Auth user. No email column.
-- -----------------------------------------------------------------------------
create table public.profiles (
  id         uuid primary key
    references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;


-- -----------------------------------------------------------------------------
-- 3. subscriptions (§3.2, §7.7)
-- One row per owner: the plan plus the mirrored Stripe state.
-- Owners will only ever be able to read it (grants and policy in migration 7).
-- -----------------------------------------------------------------------------
create table public.subscriptions (
  owner_id               uuid primary key
    references public.profiles (id) on delete cascade,
  plan                   public.plan_type not null default 'free'
    references public.plan_limits (plan) on delete restrict,
  status                 text,
  stripe_customer_id     text unique,
  stripe_subscription_id text unique,
  current_period_end     timestamptz,
  cancel_at_period_end   boolean not null default false,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint subscriptions_pro_requires_stripe_subscription
    check (plan = 'free' or stripe_subscription_id is not null)
);

alter table public.subscriptions enable row level security;

create trigger subscriptions_set_updated_at
  before update on public.subscriptions
  for each row
  execute function public.set_updated_at();


-- -----------------------------------------------------------------------------
-- 4. current_plan(p_owner_id) (§4.4, §7.7, DB7)
-- Returns 'pro' only when plan = 'pro' AND status is 'active' or 'trialing'.
-- Anything else, including a missing row, returns 'free'.
-- current_period_end is deliberately ignored (§7.7).
-- SECURITY INVOKER: not on the §6.1 rule 3 list of DEFINER functions, so the
-- caller needs SELECT on subscriptions (service_role gets it in migration 7).
-- -----------------------------------------------------------------------------
create function public.current_plan(p_owner_id uuid)
returns public.plan_type
language sql
stable
security invoker
set search_path = ''
as $$
  select case
           when exists (
             select 1
             from public.subscriptions s
             where s.owner_id = p_owner_id
               and s.plan = 'pro'::public.plan_type
               and s.status in ('active', 'trialing')
           )
           then 'pro'::public.plan_type
           else 'free'::public.plan_type
         end;
$$;

-- §6.1 rule 1: revoke from browser roles, grant to service_role only (§6.2).
revoke execute on function public.current_plan(uuid) from public, anon, authenticated;
grant  execute on function public.current_plan(uuid) to service_role;


-- -----------------------------------------------------------------------------
-- 5. handle_new_user() (§4.4, §6.1 rule 3)
-- Runs when Supabase Auth creates an account: creates the profiles row and a
-- Free subscriptions row. SECURITY DEFINER because the trigger fires as
-- Supabase's Auth role, which has no rights on our tables.
-- Fixed empty search_path; every name is schema-qualified.
-- Any error here blocks that sign-up (§13) — intended: no half-made accounts.
-- -----------------------------------------------------------------------------
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id)
  values (new.id);

  insert into public.subscriptions (owner_id)
  values (new.id);

  return new;
end;
$$;

-- §6.1 rules 1 and 5: no direct calls by anyone. No GRANT needed: triggers
-- fire without checking EXECUTE (§6.2).
revoke execute on function public.handle_new_user() from public, anon, authenticated;


-- -----------------------------------------------------------------------------
-- 6. Trigger on auth.users (§4.4, §9 row 2)
-- Must be tested with T19 before anything depends on it (§13).
-- -----------------------------------------------------------------------------
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();
