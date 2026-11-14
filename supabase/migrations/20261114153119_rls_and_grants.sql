-- =============================================================================
-- SlotMate — Migration 7: rls_and_grants
--
-- Implements docs/DATABASE.md:
--   §5.1  rules 1-5 (RLS confirm, explicit REVOKE, policies for authenticated
--         using (select auth.uid()), column-level grants)
--   §5.2  who can do what (owner = authenticated; visitor via server = service_role)
--   §5.4  Storage bucket resource-images (S1)
--   §6.3  rate_limit_attempts / stripe_events closed to every role
--   §7.7  subscriptions read-only for owners (BILL-06, T5)
--   §7.8  locked items: owners may read and delete, not update
--
-- Background (migration 1, m1 check 5): tables created by postgres give anon
-- and authenticated nothing, and service_role only MAINTAIN/REFERENCES/
-- TRIGGER/TRUNCATE. So every SELECT/INSERT/UPDATE/DELETE needed is granted
-- here explicitly. Functions give nobody EXECUTE unless granted (done in
-- migrations 2 and 6 next to each function, §6.1 rule 1).
--
-- "Locked" for an owner edit: the row's own is_locked AND (for children) the
-- parent workspace's is_locked.
-- FLAG: §5.2 says "unless locked"; checking the workspace lock as well as the
-- resource lock is stricter and covers resources inside a locked workspace.
--
-- No policy calls current_plan() or any other public function, so authenticated
-- needs no EXECUTE grant (§6.1 rule 6 allow-list stays empty).
-- =============================================================================


-- =============================================================================
-- 1. RLS confirmation (§5.1 rule 1; already on since migrations 2-5)
-- =============================================================================
alter table public.profiles              enable row level security;
alter table public.subscriptions         enable row level security;
alter table public.plan_limits           enable row level security;
alter table public.workspaces            enable row level security;
alter table public.resources             enable row level security;
alter table public.resource_availability enable row level security;
alter table public.bookings              enable row level security;
alter table public.monthly_usage         enable row level security;
alter table public.rate_limit_attempts   enable row level security;
alter table public.stripe_events         enable row level security;
alter table public.embed_configurations  enable row level security;


-- =============================================================================
-- 2. Explicit lock-down (§5.1 rule 3)
-- Default privileges already leave these closed; stated explicitly anyway.
-- =============================================================================
revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;


-- =============================================================================
-- 3. authenticated (logged-in owner) — privileges (§5.1 rules 3 and 5, §5.2)
-- Column lists are exactly what an owner may write. Never granted:
-- is_locked, owner_id on UPDATE, plan, any usage count, status_token_hash.
-- =============================================================================

-- Read-only tables (§6.3: profiles, subscriptions, monthly_usage, plan_limits).
grant select on public.profiles      to authenticated;
grant select on public.subscriptions to authenticated;   -- BILL-06: SELECT only
grant select on public.plan_limits   to authenticated;
grant select on public.monthly_usage to authenticated;

-- workspaces: read, create, edit name/description/slug/time zone, delete.
-- FLAG: owner_id is insertable so the owner can create a row at all; the
-- insert policy forces owner_id = auth.uid(). It is NOT updatable.
grant select on public.workspaces to authenticated;
grant insert (owner_id, name, description, slug, time_zone) on public.workspaces to authenticated;
grant update (name, description, slug, time_zone)           on public.workspaces to authenticated;
grant delete on public.workspaces to authenticated;

-- resources: read, create, edit, delete.
-- FLAG: owner_id/workspace_id insertable for the same reason (policy-checked,
-- and the composite FK forces owner_id to equal the workspace's owner).
-- image_path is NOT granted to owners; it is written only by the server-side
-- upload flow (S1) through set_resource_image() (owner decision Q2).
grant select on public.resources to authenticated;
grant insert (workspace_id, owner_id, name, description, is_available, slot_minutes, capacity)
  on public.resources to authenticated;
grant update (name, description, is_available, slot_minutes, capacity)
  on public.resources to authenticated;
grant delete on public.resources to authenticated;

-- resource_availability: read; create, edit, delete for own unlocked resources.
-- resource_id is not updatable (a schedule row cannot move to another resource).
grant select on public.resource_availability to authenticated;
grant insert (resource_id, weekday, opens_at, closes_at) on public.resource_availability to authenticated;
grant update (weekday, opens_at, closes_at)              on public.resource_availability to authenticated;
grant delete on public.resource_availability to authenticated;

-- bookings: read own; change ONLY status; delete own. Cannot insert (§5.2).
grant select         on public.bookings to authenticated;
grant update (status) on public.bookings to authenticated;
grant delete         on public.bookings to authenticated;

-- embed_configurations: read own; edit theme/layout/background. No insert or
-- delete (the row is automatic, §5.2).
grant select on public.embed_configurations to authenticated;
grant update (theme, layout, background_color) on public.embed_configurations to authenticated;

-- rate_limit_attempts, stripe_events: nothing (§6.3).


-- =============================================================================
-- 4. authenticated — RLS policies (§5.1 rule 4, §5.2, §5.3)
-- =============================================================================

-- profiles: read own row.
create policy profiles_select_own on public.profiles
  for select to authenticated
  using (id = (select auth.uid()));

-- subscriptions: read own row. No insert/update/delete policy (§7.7).
create policy subscriptions_select_own on public.subscriptions
  for select to authenticated
  using (owner_id = (select auth.uid()));

-- plan_limits: two rows of plain numbers, nothing private.
create policy plan_limits_select_all on public.plan_limits
  for select to authenticated
  using (true);

-- monthly_usage: read own counts.
create policy monthly_usage_select_own on public.monthly_usage
  for select to authenticated
  using (owner_id = (select auth.uid()));

-- workspaces
create policy workspaces_select_own on public.workspaces
  for select to authenticated
  using (owner_id = (select auth.uid()));

create policy workspaces_insert_own on public.workspaces
  for insert to authenticated
  with check (owner_id = (select auth.uid()));

create policy workspaces_update_own_unlocked on public.workspaces
  for update to authenticated
  using      (owner_id = (select auth.uid()) and not is_locked)
  with check (owner_id = (select auth.uid()) and not is_locked);

-- Delete is allowed even when locked (§7.8: the way back within the limits).
create policy workspaces_delete_own on public.workspaces
  for delete to authenticated
  using (owner_id = (select auth.uid()));

-- resources
create policy resources_select_own on public.resources
  for select to authenticated
  using (owner_id = (select auth.uid()));

-- Not into a locked workspace (§5.2).
create policy resources_insert_own_unlocked_workspace on public.resources
  for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and exists (
      select 1 from public.workspaces w
      where w.id = resources.workspace_id
        and w.owner_id = (select auth.uid())
        and not w.is_locked
    )
  );

create policy resources_update_own_unlocked on public.resources
  for update to authenticated
  using (
    owner_id = (select auth.uid())
    and not is_locked
    and exists (
      select 1 from public.workspaces w
      where w.id = resources.workspace_id
        and not w.is_locked
    )
  )
  with check (
    owner_id = (select auth.uid())
    and not is_locked
    and exists (
      select 1 from public.workspaces w
      where w.id = resources.workspace_id
        and not w.is_locked
    )
  );

create policy resources_delete_own on public.resources
  for delete to authenticated
  using (owner_id = (select auth.uid()));

-- resource_availability (no owner_id column: ownership via the resource)
create policy resource_availability_select_own on public.resource_availability
  for select to authenticated
  using (
    exists (
      select 1 from public.resources r
      where r.id = resource_availability.resource_id
        and r.owner_id = (select auth.uid())
    )
  );

create policy resource_availability_insert_own_unlocked on public.resource_availability
  for insert to authenticated
  with check (
    exists (
      select 1
      from public.resources r
      join public.workspaces w on w.id = r.workspace_id
      where r.id = resource_availability.resource_id
        and r.owner_id = (select auth.uid())
        and not r.is_locked
        and not w.is_locked
    )
  );

create policy resource_availability_update_own_unlocked on public.resource_availability
  for update to authenticated
  using (
    exists (
      select 1
      from public.resources r
      join public.workspaces w on w.id = r.workspace_id
      where r.id = resource_availability.resource_id
        and r.owner_id = (select auth.uid())
        and not r.is_locked
        and not w.is_locked
    )
  )
  with check (
    exists (
      select 1
      from public.resources r
      join public.workspaces w on w.id = r.workspace_id
      where r.id = resource_availability.resource_id
        and r.owner_id = (select auth.uid())
        and not r.is_locked
        and not w.is_locked
    )
  );

create policy resource_availability_delete_own_unlocked on public.resource_availability
  for delete to authenticated
  using (
    exists (
      select 1
      from public.resources r
      join public.workspaces w on w.id = r.workspace_id
      where r.id = resource_availability.resource_id
        and r.owner_id = (select auth.uid())
        and not r.is_locked
        and not w.is_locked
    )
  );

-- bookings: read own; status change and delete only when not locked (§5.2).
-- The allowed status path itself is enforced by the trigger (migration 4).
create policy bookings_select_own on public.bookings
  for select to authenticated
  using (owner_id = (select auth.uid()));

create policy bookings_update_status_own_unlocked on public.bookings
  for update to authenticated
  using (
    owner_id = (select auth.uid())
    and exists (
      select 1
      from public.resources r
      join public.workspaces w on w.id = r.workspace_id
      where r.id = bookings.resource_id
        and not r.is_locked
        and not w.is_locked
    )
  )
  with check (
    owner_id = (select auth.uid())
    and exists (
      select 1
      from public.resources r
      join public.workspaces w on w.id = r.workspace_id
      where r.id = bookings.resource_id
        and not r.is_locked
        and not w.is_locked
    )
  );

create policy bookings_delete_own_unlocked on public.bookings
  for delete to authenticated
  using (
    owner_id = (select auth.uid())
    and exists (
      select 1
      from public.resources r
      join public.workspaces w on w.id = r.workspace_id
      where r.id = bookings.resource_id
        and not r.is_locked
        and not w.is_locked
    )
  );

-- embed_configurations (ownership via the workspace)
create policy embed_configurations_select_own on public.embed_configurations
  for select to authenticated
  using (
    exists (
      select 1 from public.workspaces w
      where w.id = embed_configurations.workspace_id
        and w.owner_id = (select auth.uid())
    )
  );

-- Pro-only values are enforced by the trigger (migration 3).
create policy embed_configurations_update_own_unlocked on public.embed_configurations
  for update to authenticated
  using (
    exists (
      select 1 from public.workspaces w
      where w.id = embed_configurations.workspace_id
        and w.owner_id = (select auth.uid())
        and not w.is_locked
    )
  )
  with check (
    exists (
      select 1 from public.workspaces w
      where w.id = embed_configurations.workspace_id
        and w.owner_id = (select auth.uid())
        and not w.is_locked
    )
  );

-- No policies for anon at all (§5.1 rule 2). No policies on
-- rate_limit_attempts or stripe_events (§6.3).


-- =============================================================================
-- 5. service_role (our server with the secret key; skips RLS) — §5.1 rule 2,
--    ARCHITECTURE A4. Only what the six server-side places need:
--      (1) public reads   (2) booking submission   (3) rate limit
--      (4) Stripe webhook (5) resource image uploads (S1)
--      (6) downgrade selection (S2)
--    Function EXECUTE grants for (2), (3), (4), (5) set_resource_image,
--    (6), current_plan and reconcile_locks are in migrations 2 and 6.
-- =============================================================================

-- (1) Public page, widget and status page reads (§5.2 "Visitor via server").
grant select on public.workspaces            to service_role;
grant select on public.resources             to service_role;
grant select on public.resource_availability to service_role;
grant select on public.embed_configurations  to service_role;
-- "Not accepting requests" message (§7.3 readers) and the limit it compares with.
grant select on public.monthly_usage         to service_role;
grant select on public.plan_limits           to service_role;

-- Bookings: taken time ranges (no personal details, ISO-03) and the status
-- page lookup by token hash (resource, time, visitor name, status, §7.5).
-- FLAG: column-level, so service_role cannot read visitor_email,
-- visitor_phone or note at all. (In QUESTIONS.)
grant select (id, resource_id, owner_id, starts_at, ends_at, status, visitor_name, status_token_hash)
  on public.bookings to service_role;

-- (4) Stripe webhook: find the owner's row and save Stripe's current state
-- (§7.6 step 3, §7.7). SELECT is also needed by current_plan(), which is
-- SECURITY INVOKER. No INSERT/DELETE: the row is created by handle_new_user
-- and removed by the cascade from auth.users.
grant select on public.subscriptions to service_role;
grant update (plan, status, stripe_customer_id, stripe_subscription_id,
              current_period_end, cancel_at_period_end)
  on public.subscriptions to service_role;

-- (5) Resource image uploads (S1): the server verifies owner/resource with the
-- SELECTs above and writes the file to Storage. The path is recorded ONLY
-- through public.set_resource_image() (migration 6, owner decision Q2), which
-- refuses unless the resource is the owner's and neither it nor its workspace
-- is locked. service_role has NO table UPDATE right on resources.

-- (2), (3), (5), (6): no table write privileges needed; the functions are
-- SECURITY DEFINER.
-- rate_limit_attempts, stripe_events: no privileges for any role (§6.3).

-- REVIEW FIX (finding 3) / FLAG: migration 1 left service_role's default
-- MAINTAIN, REFERENCES, TRIGGER and TRUNCATE on new tables. None is needed by
-- the six A4 places, and TRUNCATE would skip RLS and row triggers and could
-- wipe monthly_usage (which must never be lowered, §7.3) or the closed
-- tables of §6.3. MAINTAIN (VACUUM/ANALYZE) is harmless and kept.
-- (QUESTION: confirm.)
revoke truncate, trigger, references on all tables in schema public from service_role;

-- Owner decision (review-2 finding 3): the revoke above only covers tables
-- that exist now. This removes the same rights from the DEFAULT privileges, so
-- any table created later by postgres in public also starts without them.
-- (Migration 1 is already applied and is not edited.)
alter default privileges for role postgres in schema public
  revoke truncate, trigger, references on tables from service_role;


-- =============================================================================
-- 6. Storage bucket for resource images (§5.4, S1, D9, RES-05)
-- Publicly readable; JPG, PNG and WebP only; at most 2 MB.
-- No browser role gets ANY policy on storage.objects: uploads use the
-- service-role key from server code only. Public files are served through the
-- bucket's public URL, which needs no SELECT policy.
-- FLAG: 2 MB written as 2 MiB = 2097152 bytes; the server-side check (S1) is
-- the precise limit.
-- FLAG: no SELECT policy on storage.objects is added on purpose, so nobody can
-- list the bucket's files through the API.
-- =============================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'resource-images',
  'resource-images',
  true,
  2097152,
  array['image/jpeg', 'image/png', 'image/webp']
)
-- REVIEW FIX (finding 9): if the bucket was already created in the dashboard,
-- bring it to the documented settings instead of failing the whole push.
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
