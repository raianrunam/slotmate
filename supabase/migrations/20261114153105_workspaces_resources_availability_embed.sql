-- =============================================================================
-- SlotMate — Migration 3: workspaces_resources_availability_embed
--
-- Implements docs/DATABASE.md:
--   §3.4  workspaces              (WORK-01..04, DB3, DB10)
--   §3.5  resources               (RES-01..08, DB3)
--   §3.6  resource_availability   (AVAIL-01/02, DB9)
--   §3.11 embed_configurations    (EMBED-03..05)
--   §4.4  validate_time_zone(), handle_new_workspace(), enforce_embed_plan_rules()
--   §9 row 3: "time-zone, new-workspace and embed triggers"
--
-- RLS is enabled on every table here (§9). Grants and policies: migration 7.
-- The plan-limit triggers for workspaces/resources are in migration 6 (§9 row 6).
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. workspaces (§3.4)
-- -----------------------------------------------------------------------------
create table public.workspaces (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null
    references public.profiles (id) on delete cascade,
  name        text not null,
  description text,
  slug        text not null,
  time_zone   text not null,                 -- DB10: required, NO default
  is_locked   boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint workspaces_slug_key unique (slug),
  -- DB3: lets resources prove their owner copy matches the workspace owner.
  constraint workspaces_id_owner_id_key unique (id, owner_id),

  constraint workspaces_name_length
    check (char_length(btrim(name)) between 1 and 100),
  constraint workspaces_description_length
    check (description is null or char_length(description) <= 1000),
  constraint workspaces_slug_format
    check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint workspaces_slug_length
    check (char_length(slug) between 3 and 40)
);

alter table public.workspaces enable row level security;

create index workspaces_owner_id_idx on public.workspaces (owner_id);

create trigger workspaces_set_updated_at
  before update on public.workspaces
  for each row
  execute function public.set_updated_at();


-- -----------------------------------------------------------------------------
-- 2. resources (§3.5)
-- -----------------------------------------------------------------------------
create table public.resources (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  owner_id     uuid not null,                -- copy of the workspace owner (DB3)
  name         text not null,
  description  text,
  image_path   text,                         -- Storage path (D9); length check below
  is_available boolean not null default true,
  is_locked    boolean not null default false,
  slot_minutes integer not null,             -- RES-07: no default
  capacity     integer not null,             -- RES-08: no default
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  -- DB3: the pair must match a workspace row, so the owner copy cannot drift.
  constraint resources_workspace_owner_fkey
    foreign key (workspace_id, owner_id)
    references public.workspaces (id, owner_id) on delete cascade,
  -- For the bookings table's matching composite foreign key.
  constraint resources_id_owner_id_key unique (id, owner_id),

  constraint resources_name_length
    check (char_length(btrim(name)) between 1 and 100),
  constraint resources_description_length
    check (description is null or char_length(description) <= 1000),
  -- REVIEW FIX (finding 8) / FLAG: §3.5 gives no limit, but the §3 convention
  -- is that text columns have one. 1024 characters is far more than any
  -- Storage path we create.
  constraint resources_image_path_length
    check (image_path is null or char_length(image_path) <= 1024),
  constraint resources_slot_minutes_range
    check (slot_minutes between 5 and 1440),
  constraint resources_capacity_range
    check (capacity between 1 and 1000)
);

alter table public.resources enable row level security;

create index resources_workspace_id_idx on public.resources (workspace_id);
create index resources_owner_id_idx     on public.resources (owner_id);

create trigger resources_set_updated_at
  before update on public.resources
  for each row
  execute function public.set_updated_at();


-- -----------------------------------------------------------------------------
-- 3. resource_availability (§3.6, DB9)
-- One row per OPEN weekday. ISO weekdays: 1 = Monday ... 7 = Sunday.
-- No created_at/updated_at: §3.6 lists none.
-- -----------------------------------------------------------------------------
create table public.resource_availability (
  id          uuid primary key default gen_random_uuid(),
  resource_id uuid not null
    references public.resources (id) on delete cascade,
  weekday     smallint not null,
  opens_at    time not null,
  closes_at   time not null,                 -- '24:00' allowed (midnight)

  -- DB9: one opening window per weekday. Also the lookup index.
  constraint resource_availability_resource_weekday_key unique (resource_id, weekday),

  constraint resource_availability_weekday_range
    check (weekday between 1 and 7),
  constraint resource_availability_closes_after_opens
    check (closes_at > opens_at)
);

alter table public.resource_availability enable row level security;


-- -----------------------------------------------------------------------------
-- 4. embed_configurations (§3.11)
-- Exactly one row per workspace, created automatically (handle_new_workspace).
-- -----------------------------------------------------------------------------
create table public.embed_configurations (
  workspace_id     uuid primary key
    references public.workspaces (id) on delete cascade,
  theme            public.embed_theme  not null default 'light',
  layout           public.embed_layout not null default 'list',
  background_color text,                     -- NULL = the theme's default
  updated_at       timestamptz not null default now(),

  -- SEC-02: only a plain hex colour code, never anything that could carry script.
  constraint embed_configurations_background_color_format
    check (background_color is null or background_color ~ '^#[0-9a-fA-F]{6}$')
);

alter table public.embed_configurations enable row level security;

create trigger embed_configurations_set_updated_at
  before update on public.embed_configurations
  for each row
  execute function public.set_updated_at();


-- -----------------------------------------------------------------------------
-- 5. validate_time_zone() (§3.4, §4.4, §7.9, DB10)
-- Refuses names that are not real time-zone names. A check constraint cannot
-- look up the zone list, so a trigger asks Postgres.
-- SECURITY INVOKER: it only reads the public catalog view pg_timezone_names.
-- -----------------------------------------------------------------------------
create function public.validate_time_zone()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_timezone_names tz
    where tz.name = new.time_zone
  ) then
    raise exception 'invalid_time_zone';
  end if;

  return new;
end;
$$;

-- §6.1 rule 5: trigger functions get the same revoke. No GRANT needed.
revoke execute on function public.validate_time_zone() from public, anon, authenticated;

create trigger workspaces_validate_time_zone
  before insert or update of time_zone on public.workspaces
  for each row
  execute function public.validate_time_zone();


-- -----------------------------------------------------------------------------
-- 6. handle_new_workspace() (§3.11, §4.4)
-- Creates the default embed_configurations row for each new workspace.
-- FLAG: SECURITY DEFINER although §6.1 rule 3's list does not name it. Owners
-- create workspaces with their own login and have NO insert privilege on
-- embed_configurations (§5.2: "No insert or delete (the row is automatic)"),
-- so this function must "do what the caller may not" (the rule 3 principle).
-- It takes no input except the new workspace row and inserts one fixed row.
-- (Listed in QUESTIONS for confirmation.)
-- -----------------------------------------------------------------------------
create function public.handle_new_workspace()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.embed_configurations (workspace_id)
  values (new.id);

  return new;
end;
$$;

revoke execute on function public.handle_new_workspace() from public, anon, authenticated;

create trigger workspaces_create_embed_configuration
  after insert on public.workspaces
  for each row
  execute function public.handle_new_workspace();


-- -----------------------------------------------------------------------------
-- 7. enforce_embed_plan_rules() (§3.11, §4.4, §7.7, EMBED-05)
-- A Free owner cannot CHANGE TO a Pro-only value: layout 'grid', or a
-- background colour. Leftover Pro values from before a downgrade are kept
-- (they return on upgrade); the server ignores them when building the widget.
-- FLAG: SECURITY DEFINER although §6.1 rule 3's list does not name it. It must
-- call current_plan(), which owners may not execute (§6.2), and read the
-- workspace's owner. It changes nothing; it only refuses. (In QUESTIONS.)
-- -----------------------------------------------------------------------------
create function public.enforce_embed_plan_rules()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner_id uuid;
begin
  select w.owner_id
    into v_owner_id
  from public.workspaces w
  where w.id = new.workspace_id;

  if public.current_plan(v_owner_id) = 'pro'::public.plan_type then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.layout = 'grid'::public.embed_layout or new.background_color is not null then
      raise exception 'pro_only_embed_option';
    end if;
  else
    -- UPDATE: refuse only a change TO a Pro-only value; keep leftovers.
    if new.layout = 'grid'::public.embed_layout
       and old.layout is distinct from new.layout then
      raise exception 'pro_only_embed_option';
    end if;

    if new.background_color is not null
       and old.background_color is distinct from new.background_color then
      raise exception 'pro_only_embed_option';
    end if;
  end if;

  return new;
end;
$$;

revoke execute on function public.enforce_embed_plan_rules() from public, anon, authenticated;

create trigger embed_configurations_enforce_plan_rules
  before insert or update on public.embed_configurations
  for each row
  execute function public.enforce_embed_plan_rules();
