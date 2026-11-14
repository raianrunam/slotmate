-- =============================================================================
-- SlotMate — Migration 6: functions
--
-- Implements docs/DATABASE.md:
--   §7.7  enforce_workspace_limit() / enforce_resource_limit() + triggers (A6, BILL-07)
--   §7.2  submit_booking()                    (A5, DB5, §7.3 monthly counter)
--   §7.4  check_rate_limit()                  (A9, D24, SEC-06)
--   §7.6  claim_stripe_event() / mark_stripe_event_processed()  (A14, DB12)
--   §7.8  reconcile_locks() + its triggers    (D20, A18, DB8)
--   §7.8  apply_downgrade_selection()         (S2, DB17)
--   S1    set_resource_image()                (owner decision Q2)
--         FLAG: §9 row 6 does not list apply_downgrade_selection, but §6.1
--         rule 1 and §7.8 require it, and this is the "functions" migration.
--
-- Every function: SET search_path = '' and schema-qualified names (§6.1 rule 2);
-- EXECUTE revoked from PUBLIC, anon and authenticated (§6.1 rules 1 and 5);
-- server-only functions granted to service_role only (§6.1 rule 1, §6.2).
-- No function here is callable by anon or authenticated (§6.1 rule 6: the
-- allow-list is empty).
--
-- Lock order: the limit triggers, reconcile_locks and apply_downgrade_selection
-- first lock the owner's profiles row (§7.7 step 1), so they run one after
-- another per owner.
-- REVIEW NOTE (finding 5): a DELETE of workspaces/resources locks those rows
-- first and the profile only afterwards (in the after-delete trigger). Two
-- overlapping deletes, or a delete overlapping a webhook reconcile, can
-- therefore deadlock; PostgreSQL aborts one with 40P01 and no data is damaged.
-- Owner decision (Q10, widened after review-2 finding 2): ALL write Server
-- Actions, including booking submission, retry once on 40P01. That is safe:
-- the whole transaction, including submit_booking's +1 usage, is undone. The
-- Stripe webhook relies on Stripe's own retry. No lock reordering in SQL.
-- =============================================================================


-- =============================================================================
-- 1. Plan-limit triggers (§7.7, A6, BILL-07)
-- SECURITY DEFINER (named in §6.1 rule 3): owners may not lock profile rows
-- (FOR UPDATE needs UPDATE privilege) or execute current_plan().
-- Locked items still count (§7.7 step 2, §7.8).
-- =============================================================================

create function public.enforce_workspace_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
  v_limit integer;
begin
  -- REVIEW FIX (finding 6): this BEFORE trigger runs before the RLS WITH CHECK.
  -- Refuse a foreign owner_id first, so a logged-in owner cannot lock another
  -- owner's profile row or learn whether that owner exists / is at the limit.
  -- auth.uid() is NULL for service_role and postgres, so those paths are unaffected.
  if (select auth.uid()) is not null
     and new.owner_id is distinct from (select auth.uid()) then
    raise exception 'not_owner';
  end if;

  -- Step 1: serialise this owner's creates (prevents "2 of 3" races).
  perform 1
  from public.profiles p
  where p.id = new.owner_id
  for update;

  if not found then
    raise exception 'owner_not_found';
  end if;

  -- Step 2: count existing workspaces, including locked ones.
  select count(*)
    into v_count
  from public.workspaces w
  where w.owner_id = new.owner_id;

  -- Step 3: compare with the limit for the owner's plan right now.
  select pl.max_workspaces
    into v_limit
  from public.plan_limits pl
  where pl.plan = public.current_plan(new.owner_id);

  if v_limit is null or v_count >= v_limit then
    raise exception 'workspace_limit_reached';
  end if;

  return new;
end;
$$;

revoke execute on function public.enforce_workspace_limit() from public, anon, authenticated;

create trigger workspaces_enforce_limit
  before insert on public.workspaces
  for each row
  execute function public.enforce_workspace_limit();


create function public.enforce_resource_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
  v_limit integer;
begin
  -- REVIEW FIX (finding 6): see enforce_workspace_limit.
  if (select auth.uid()) is not null
     and new.owner_id is distinct from (select auth.uid()) then
    raise exception 'not_owner';
  end if;

  perform 1
  from public.profiles p
  where p.id = new.owner_id
  for update;

  if not found then
    raise exception 'owner_not_found';
  end if;

  select count(*)
    into v_count
  from public.resources r
  where r.owner_id = new.owner_id;

  select pl.max_resources
    into v_limit
  from public.plan_limits pl
  where pl.plan = public.current_plan(new.owner_id);

  if v_limit is null or v_count >= v_limit then
    raise exception 'resource_limit_reached';
  end if;

  return new;
end;
$$;

revoke execute on function public.enforce_resource_limit() from public, anon, authenticated;

create trigger resources_enforce_limit
  before insert on public.resources
  for each row
  execute function public.enforce_resource_limit();


-- =============================================================================
-- 2. submit_booking (§7.2, A5, DB5)
-- One call = one transaction. SECURITY DEFINER, service_role only.
-- Errors: slot_taken, limit_reached, not_bookable, invalid_slot, past,
-- too_far, too_many_attendees.
-- FLAG: output column names booking_id / booking_starts_at / booking_ends_at
-- (not "id/starts_at/ends_at") so they cannot clash with table column names
-- inside PL/pgSQL.
-- =============================================================================
create function public.submit_booking(
  p_resource_id       uuid,
  p_starts_at         timestamptz,
  p_visitor_name      text,
  p_visitor_email     text,
  p_visitor_phone     text,
  p_note              text,
  p_attendees         integer,
  p_status_token_hash bytea
)
returns table (
  booking_id        uuid,
  booking_starts_at timestamptz,
  booking_ends_at   timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner_id          uuid;
  v_is_available      boolean;
  v_resource_locked   boolean;
  v_workspace_locked  boolean;
  v_slot_minutes      integer;
  v_capacity          integer;
  v_time_zone         text;

  v_local_start       timestamp;   -- wall-clock time in the workspace's zone
  v_offset_now        interval;    -- UTC offset at p_starts_at
  v_offset_prev       interval;    -- UTC offset 24 hours earlier
  v_local_end         timestamp;   -- wall-clock end (start + slot length)
  v_offset_end        interval;    -- UTC offset at the computed end instant
  v_offset_end_prev   interval;    -- UTC offset 24 hours before that
  v_local_time_sec    numeric;
  v_opens_sec         numeric;
  v_closes_sec        numeric;
  v_slot_sec          numeric;
  v_opens_at          time;
  v_closes_at         time;
  v_ends_at           timestamptz;

  v_limit             integer;
  v_month             date;
  v_new_count         integer;
  v_booking_id        uuid;
begin
  -- Step 1: load resource + workspace in one query.
  -- FLAG: FOR SHARE (not in §7.2) so a concurrent lock/unlock or edit of this
  -- resource/workspace waits until this booking commits. Shared locks do not
  -- block other bookings.
  select r.owner_id, r.is_available, r.is_locked, r.slot_minutes, r.capacity,
         w.time_zone, w.is_locked
    into v_owner_id, v_is_available, v_resource_locked, v_slot_minutes, v_capacity,
         v_time_zone, v_workspace_locked
  from public.resources r
  join public.workspaces w on w.id = r.workspace_id
  where r.id = p_resource_id
  for share of r, w;

  if not found then
    raise exception 'not_bookable';
  end if;

  -- Step 2: bookable? (RES-06, BILL-09)
  if not v_is_available or v_resource_locked or v_workspace_locked then
    raise exception 'not_bookable';
  end if;

  -- Step 3: convert to the workspace's clock (ARCHITECTURE 5.4).
  -- §7.2 step 3: when clocks go back and an hour happens twice, only the FIRST
  -- copy is bookable; the second copy is refused.
  -- REVIEW FIX (finding 1): the first draft used a plain round trip
  -- ("local at time zone tz = p_starts_at"). PostgreSQL reads an ambiguous
  -- local time as the LATER instant, so that check accepted the second copy
  -- and refused the first — the opposite of §7.2. Instead we look for an
  -- EARLIER instant with the same wall-clock time: if one exists, p_starts_at
  -- is the second copy. The candidate earlier instant is p_starts_at minus the
  -- drop in UTC offset over the previous day (0 on normal days), and it is
  -- only accepted as proof if its wall-clock time really is the same.
  v_local_start := p_starts_at at time zone v_time_zone;

  if v_local_start is null then
    raise exception 'invalid_slot';
  end if;

  -- FLAG: "24 hours", not "1 day": for timestamptz, '1 day' means a calendar
  -- day in the SESSION time zone (23 or 25 hours on a change day if the session
  -- zone observes summer time). '24 hours' is exactly 24 hours in every session.
  v_offset_now  := v_local_start - (p_starts_at at time zone 'UTC');
  v_offset_prev := ((p_starts_at - interval '24 hours') at time zone v_time_zone)
                 - ((p_starts_at - interval '24 hours') at time zone 'UTC');

  if v_offset_prev > v_offset_now
     and ((p_starts_at - (v_offset_prev - v_offset_now)) at time zone v_time_zone) = v_local_start then
    raise exception 'invalid_slot';   -- second copy of a repeated hour
  end if;

  -- Step 4: valid slot for that local date's ISO weekday? (AVAIL-01..03, AVAIL-05)
  select ra.opens_at, ra.closes_at
    into v_opens_at, v_closes_at
  from public.resource_availability ra
  where ra.resource_id = p_resource_id
    and ra.weekday = extract(isodow from v_local_start)::smallint;

  if not found then
    raise exception 'invalid_slot';
  end if;

  -- Work in seconds since midnight, not in "time" arithmetic: time + interval
  -- wraps around midnight, and closes_at may be 24:00 (= 86400 seconds).
  v_local_time_sec := extract(epoch from v_local_start::time);
  v_opens_sec      := extract(epoch from v_opens_at);
  v_closes_sec     := extract(epoch from v_closes_at);
  v_slot_sec       := v_slot_minutes * 60;

  if v_local_time_sec < v_opens_sec
     or v_local_time_sec + v_slot_sec > v_closes_sec
     or mod(v_local_time_sec - v_opens_sec, v_slot_sec) <> 0 then
    raise exception 'invalid_slot';
  end if;

  -- Step 5: compute ends_at in the workspace's clock; the visitor cannot send it.
  v_local_end := v_local_start + pg_catalog.make_interval(mins => v_slot_minutes);
  v_ends_at   := v_local_end at time zone v_time_zone;

  -- Owner decision (review-2 finding 1): the END of a slot also uses the FIRST
  -- copy of a repeated hour, the same rule as the start in step 3. Without it,
  -- a slot ending inside the repeated hour got an end one hour too late and
  -- overlapped the next slot (e.g. London 2026-10-25: 00:00 BST + 60 min ended
  -- at 01:00 GMT instead of 01:00 BST).
  -- If PostgreSQL returned the LATER copy, the UTC offset 24 hours earlier is
  -- larger than the offset now; stepping back by that difference lands on the
  -- earlier copy, which we accept only if its wall-clock time is really the
  -- same. If PostgreSQL already returned the earlier copy, the two offsets are
  -- equal, nothing changes, and the result is the same. A local end inside a
  -- skipped hour is never ambiguous and is left as PostgreSQL resolves it.
  -- A slot that crosses a clock change keeps its wall-clock end and may last
  -- longer or shorter in real time (owner decision Q7: allowed).
  v_offset_end      := (v_ends_at at time zone v_time_zone)
                     - (v_ends_at at time zone 'UTC');
  v_offset_end_prev := ((v_ends_at - interval '24 hours') at time zone v_time_zone)
                     - ((v_ends_at - interval '24 hours') at time zone 'UTC');

  if v_offset_end_prev > v_offset_end
     and ((v_ends_at - (v_offset_end_prev - v_offset_end)) at time zone v_time_zone) = v_local_end then
    v_ends_at := v_ends_at - (v_offset_end_prev - v_offset_end);
  end if;

  -- Safety net: ends_at must stay after starts_at (also a table check, §3.7).
  if v_ends_at <= p_starts_at then
    raise exception 'invalid_slot';
  end if;

  -- Step 6: not in the past, not more than 90 days ahead (D8).
  if p_starts_at <= pg_catalog.now() then
    raise exception 'past';
  end if;

  if v_local_start::date > (pg_catalog.now() at time zone v_time_zone)::date + 90 then
    raise exception 'too_far';
  end if;

  -- Step 7: attendees between 1 and capacity (RES-08, PUB-04).
  if p_attendees is null or p_attendees < 1 or p_attendees > v_capacity then
    raise exception 'too_many_attendees';
  end if;

  -- Step 8: monthly limit check and +1 in ONE statement (§7.3, A7).
  -- The limit comes from the owner's plan right now.
  select pl.max_monthly_bookings
    into v_limit
  from public.plan_limits pl
  where pl.plan = public.current_plan(v_owner_id);

  v_month := date_trunc('month', pg_catalog.now() at time zone 'UTC')::date;

  insert into public.monthly_usage as mu (owner_id, month, booking_count)
  values (v_owner_id, v_month, 1)
  on conflict (owner_id, month) do update
    set booking_count = mu.booking_count + 1
    where mu.booking_count < v_limit
  returning mu.booking_count into v_new_count;

  if v_new_count is null then
    raise exception 'limit_reached';
  end if;

  -- Steps 9-10: save as pending. If the exclusion constraint refuses it
  -- (23P01), raise slot_taken. Raising undoes the WHOLE call, including the
  -- +1 from step 8, so a refused request never uses up allowance.
  begin
    insert into public.bookings (
      resource_id, owner_id, visitor_name, visitor_email, visitor_phone, note,
      attendees, starts_at, ends_at, status, status_token_hash
    )
    values (
      p_resource_id, v_owner_id, p_visitor_name, p_visitor_email, p_visitor_phone, p_note,
      p_attendees, p_starts_at, v_ends_at, 'pending'::public.booking_status, p_status_token_hash
    )
    returning id into v_booking_id;
  exception
    when exclusion_violation then
      raise exception 'slot_taken';
  end;

  -- Step 11: return id, starts_at, ends_at.
  booking_id        := v_booking_id;
  booking_starts_at := p_starts_at;
  booking_ends_at   := v_ends_at;
  return next;
end;
$$;

revoke execute on function public.submit_booking(uuid, timestamptz, text, text, text, text, integer, bytea)
  from public, anon, authenticated;
grant  execute on function public.submit_booking(uuid, timestamptz, text, text, text, text, integer, bytea)
  to service_role;


-- =============================================================================
-- 3. check_rate_limit (§7.4, A9, D24, SEC-06)
-- (1) delete records older than 10 minutes; (2) record this attempt;
-- (3) count this ip_hash + workspace in the last 10 minutes;
-- (4) allowed if 5 or fewer. Every attempt is recorded, including refused ones.
-- Never touches monthly_usage. SECURITY DEFINER (named in §6.1 rule 3).
-- FLAG: returns boolean (true = allowed); §7.4 says "allowed / not allowed".
-- =============================================================================
create function public.check_rate_limit(p_workspace_id uuid, p_ip_hash bytea)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  delete from public.rate_limit_attempts a
  where a.attempted_at <= pg_catalog.now() - interval '10 minutes';

  insert into public.rate_limit_attempts (workspace_id, ip_hash)
  values (p_workspace_id, p_ip_hash);

  select count(*)
    into v_count
  from public.rate_limit_attempts a
  where a.workspace_id = p_workspace_id
    and a.ip_hash = p_ip_hash
    and a.attempted_at > pg_catalog.now() - interval '10 minutes';

  return v_count <= 5;
end;
$$;

revoke execute on function public.check_rate_limit(uuid, bytea) from public, anon, authenticated;
grant  execute on function public.check_rate_limit(uuid, bytea) to service_role;


-- =============================================================================
-- 4. Stripe webhook memory (§7.6, A14, DB12)
-- FLAG: SECURITY DEFINER although §6.1 rule 3's list does not name these two.
-- §6.3 says stripe_events is usable by "the two Stripe-event functions only",
-- so no role (not even service_role) gets table privileges on it; the
-- functions must therefore run with the owner's rights. (In QUESTIONS.)
-- =============================================================================

-- Returns 'claimed' (process it) or 'duplicate' (already processed; do nothing).
create function public.claim_stripe_event(p_event_id text, p_event_type text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inserted     text;
  v_processed_at timestamptz;
begin
  -- DB12 / §7.6 step 5: forget rows older than 30 days during later webhooks.
  -- FLAG: done here, at the start of each claim; §7.6 does not say which function.
  delete from public.stripe_events e
  where e.received_at < pg_catalog.now() - interval '30 days';

  insert into public.stripe_events (event_id, event_type)
  values (p_event_id, p_event_type)
  on conflict (event_id) do nothing
  returning event_id into v_inserted;

  if v_inserted is not null then
    return 'claimed';
  end if;

  select e.processed_at
    into v_processed_at
  from public.stripe_events e
  where e.event_id = p_event_id;

  if v_processed_at is not null then
    return 'duplicate';
  end if;

  -- Seen before but never finished (an earlier try crashed): let the retry finish.
  return 'claimed';
end;
$$;

revoke execute on function public.claim_stripe_event(text, text) from public, anon, authenticated;
grant  execute on function public.claim_stripe_event(text, text) to service_role;


-- FLAG: returns nothing and does nothing for an unknown event ID.
create function public.mark_stripe_event_processed(p_event_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.stripe_events e
  set processed_at = pg_catalog.now()
  where e.event_id = p_event_id;
end;
$$;

revoke execute on function public.mark_stripe_event_processed(text) from public, anon, authenticated;
grant  execute on function public.mark_stripe_event_processed(text) to service_role;


-- =============================================================================
-- 5. reconcile_locks (§7.8, D20, A18, DB8)
-- Never re-selects and never unlocks a subset.
--   * Within the plan's limits      -> unlock everything.
--   * Over the limits, VALID selection exists -> leave it untouched.
--   * Over the limits, no valid selection     -> lock everything (safe state).
-- Valid selection (§7.8): exactly ONE unlocked workspace; at most
-- max_resources (Free: 3) unlocked resources; every unlocked resource in that
-- workspace. The EMPTY unlocked set is NOT valid.
-- FLAG: "at most three" is read from plan_limits.max_resources for the
-- owner's current plan (3 on Free) instead of a hard-coded 3.
-- SECURITY DEFINER (named in §6.1 rule 3). service_role may call it (§6.2).
-- =============================================================================
create function public.reconcile_locks(p_owner_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_max_workspaces     integer;
  v_max_resources      integer;
  v_ws_total           integer;
  v_ws_unlocked        integer;
  v_res_total          integer;
  v_res_unlocked       integer;
  v_unlocked_ws_id     uuid;
  v_res_outside        integer;
begin
  -- Serialise with limit triggers and apply_downgrade_selection.
  -- No profile (e.g. the account is being deleted): nothing to do.
  perform 1
  from public.profiles p
  where p.id = p_owner_id
  for update;

  if not found then
    return;
  end if;

  select pl.max_workspaces, pl.max_resources
    into v_max_workspaces, v_max_resources
  from public.plan_limits pl
  where pl.plan = public.current_plan(p_owner_id);

  select count(*), count(*) filter (where not w.is_locked)
    into v_ws_total, v_ws_unlocked
  from public.workspaces w
  where w.owner_id = p_owner_id;

  select count(*), count(*) filter (where not r.is_locked)
    into v_res_total, v_res_unlocked
  from public.resources r
  where r.owner_id = p_owner_id;

  -- Within limits: lift every lock.
  if v_ws_total <= v_max_workspaces and v_res_total <= v_max_resources then
    update public.workspaces w
    set is_locked = false
    where w.owner_id = p_owner_id
      and w.is_locked;

    update public.resources r
    set is_locked = false
    where r.owner_id = p_owner_id
      and r.is_locked;

    return;
  end if;

  -- Over limits: is the current unlocked set a valid selection?
  if v_ws_unlocked = 1 and v_res_unlocked <= v_max_resources then
    select w.id
      into v_unlocked_ws_id
    from public.workspaces w
    where w.owner_id = p_owner_id
      and not w.is_locked;

    select count(*)
      into v_res_outside
    from public.resources r
    where r.owner_id = p_owner_id
      and not r.is_locked
      and r.workspace_id <> v_unlocked_ws_id;

    if v_res_outside = 0 then
      return;   -- valid selection: leave it untouched
    end if;
  end if;

  -- No valid selection: safe state, everything locked until the owner chooses.
  update public.workspaces w
  set is_locked = true
  where w.owner_id = p_owner_id
    and not w.is_locked;

  update public.resources r
  set is_locked = true
  where r.owner_id = p_owner_id
    and not r.is_locked;
end;
$$;

revoke execute on function public.reconcile_locks(uuid) from public, anon, authenticated;
grant  execute on function public.reconcile_locks(uuid) to service_role;


-- -----------------------------------------------------------------------------
-- 5a. Trigger: subscriptions plan/status change -> reconcile_locks (§7.8)
-- FLAG: SECURITY DEFINER wrapper. The webhook (service_role) could call
-- reconcile_locks directly, but a trigger function runs as the role doing the
-- UPDATE; DEFINER keeps it working whichever role that is.
-- -----------------------------------------------------------------------------
create function public.reconcile_locks_on_subscription_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.reconcile_locks(new.owner_id);
  return null;
end;
$$;

revoke execute on function public.reconcile_locks_on_subscription_change() from public, anon, authenticated;

create trigger subscriptions_reconcile_locks
  after update of plan, status on public.subscriptions
  for each row
  when (old.plan is distinct from new.plan or old.status is distinct from new.status)
  execute function public.reconcile_locks_on_subscription_change();


-- -----------------------------------------------------------------------------
-- 5b. Triggers: after deletes on workspaces/resources -> reconcile_locks (§7.8)
-- An owner deleting items (with their own login) is how they get back within
-- the limits; this lifts the locks automatically.
-- FLAG: SECURITY DEFINER wrapper, because owners may not execute
-- reconcile_locks (§6.2) and a trigger function runs as the deleting role.
-- FLAG: statement-level with a transition table, so a delete of many rows
-- (or a cascade) reconciles each affected owner once, not once per row.
-- -----------------------------------------------------------------------------
create function public.reconcile_locks_after_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner_id uuid;
begin
  for v_owner_id in
    select distinct d.owner_id from deleted_rows d
  loop
    perform public.reconcile_locks(v_owner_id);
  end loop;

  return null;
end;
$$;

revoke execute on function public.reconcile_locks_after_delete() from public, anon, authenticated;

create trigger workspaces_reconcile_locks_after_delete
  after delete on public.workspaces
  referencing old table as deleted_rows
  for each statement
  execute function public.reconcile_locks_after_delete();

create trigger resources_reconcile_locks_after_delete
  after delete on public.resources
  referencing old table as deleted_rows
  for each statement
  execute function public.reconcile_locks_after_delete();


-- =============================================================================
-- 6. apply_downgrade_selection (§7.8, S2, DB17)
-- Called by a Server Action AFTER it validated ownership and plan limits.
-- Applies the owner's chosen workspace + resources atomically.
-- Refuses the WHOLE selection (changes nothing) if:
--   * the workspace is not the owner's;
--   * any resource is not the owner's, or is NOT IN the selected workspace (DB17);
--   * more resources than the plan allows (Free: 3), or duplicates / NULLs;
--   * FLAG: the owner is not over the limits (no selection is needed; applying
--     one would lock items for no reason).
-- FLAG: a selection with fewer than 3 resources (even 0) is accepted, because
-- §7.8's valid-selection definition says "at most three".
-- FLAG: SECURITY DEFINER although §6.1 rule 3's list does not name it. It must
-- write is_locked, which no role is granted. service_role only (§6.1 rule 1, S2).
-- No automatic choice anywhere: only the supplied IDs are unlocked.
-- =============================================================================
create function public.apply_downgrade_selection(
  p_owner_id     uuid,
  p_workspace_id uuid,
  p_resource_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_resource_ids   uuid[];
  v_max_workspaces integer;
  v_max_resources  integer;
  v_ws_total       integer;
  v_res_total      integer;
  v_matching       integer;
begin
  if p_owner_id is null or p_workspace_id is null then
    raise exception 'invalid_selection';
  end if;

  -- Serialise with limit triggers and reconcile_locks.
  perform 1
  from public.profiles p
  where p.id = p_owner_id
  for update;

  if not found then
    raise exception 'invalid_selection';
  end if;

  v_resource_ids := coalesce(p_resource_ids, '{}'::uuid[]);

  -- No NULL elements and no duplicates.
  if pg_catalog.array_position(v_resource_ids, null) is not null
     or cardinality(v_resource_ids) <> (
       select count(distinct x) from unnest(v_resource_ids) as x
     ) then
    raise exception 'invalid_selection';
  end if;

  select pl.max_workspaces, pl.max_resources
    into v_max_workspaces, v_max_resources
  from public.plan_limits pl
  where pl.plan = public.current_plan(p_owner_id);

  select count(*) into v_ws_total
  from public.workspaces w
  where w.owner_id = p_owner_id;

  select count(*) into v_res_total
  from public.resources r
  where r.owner_id = p_owner_id;

  if v_ws_total <= v_max_workspaces and v_res_total <= v_max_resources then
    raise exception 'selection_not_needed';
  end if;

  if cardinality(v_resource_ids) > v_max_resources then
    raise exception 'invalid_selection';
  end if;

  -- The workspace must belong to the owner.
  perform 1
  from public.workspaces w
  where w.id = p_workspace_id
    and w.owner_id = p_owner_id;

  if not found then
    raise exception 'invalid_selection';
  end if;

  -- Every resource must belong to the owner AND to the selected workspace (DB17).
  select count(*)
    into v_matching
  from public.resources r
  where r.id = any (v_resource_ids)
    and r.owner_id = p_owner_id
    and r.workspace_id = p_workspace_id;

  if v_matching <> cardinality(v_resource_ids) then
    raise exception 'invalid_selection';
  end if;

  -- Apply: exactly the selected workspace and resources unlocked, all else locked.
  update public.workspaces w
  set is_locked = (w.id <> p_workspace_id)
  where w.owner_id = p_owner_id
    and w.is_locked is distinct from (w.id <> p_workspace_id);

  update public.resources r
  set is_locked = not (r.id = any (v_resource_ids))
  where r.owner_id = p_owner_id
    and r.is_locked is distinct from (not (r.id = any (v_resource_ids)));
end;
$$;

revoke execute on function public.apply_downgrade_selection(uuid, uuid, uuid[]) from public, anon, authenticated;
grant  execute on function public.apply_downgrade_selection(uuid, uuid, uuid[]) to service_role;


-- =============================================================================
-- 7. set_resource_image (S1, §5.4, §7.8; owner decision Q2, 2026-11-14)
-- Records a resource's Storage path after the server-side upload flow has
-- validated and stored the file. Replaces a raw UPDATE grant on
-- resources.image_path, so the downgrade lock is enforced in the database
-- even though service_role skips RLS.
-- Refuses unless the resource belongs to p_owner_id AND neither the resource
-- nor its workspace is locked. Changes only image_path.
-- SECURITY DEFINER: service_role has no UPDATE right on resources.
-- Owner decision (review-2 finding 4): the path must start with
--   <p_owner_id>/<p_resource_id>/
-- and must not contain '..', so a path can never point outside this owner's
-- and this resource's folder. The length limit is the
-- resources_image_path_length check (migration 3).
-- FLAG: the owner's wording does not say what NULL does. NULL is allowed and
-- REMOVES the image (it can only clear a path on the owner's own unlocked
-- resource, so it cannot point anywhere). Say so if NULL should be refused.
-- FLAG: a path that is only the prefix (no file name after the last '/') is
-- refused too.
-- FLAG: locks the owner's profiles row first, like reconcile_locks and
-- apply_downgrade_selection, so a lock change cannot slip in between the
-- check and the update.
-- =============================================================================
create function public.set_resource_image(
  p_owner_id    uuid,
  p_resource_id uuid,
  p_path        text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_resource_locked  boolean;
  v_workspace_locked boolean;
  v_prefix           text;
begin
  if p_owner_id is null or p_resource_id is null then
    raise exception 'resource_not_found';
  end if;

  -- Path rule (see header): own folder only, no '..'. NULL removes the image.
  if p_path is not null then
    v_prefix := p_owner_id::text || '/' || p_resource_id::text || '/';

    if pg_catalog.left(p_path, pg_catalog.char_length(v_prefix)) <> v_prefix
       or pg_catalog.char_length(p_path) = pg_catalog.char_length(v_prefix)
       or pg_catalog.strpos(p_path, '..') > 0 then
      raise exception 'invalid_path';
    end if;
  end if;

  perform 1
  from public.profiles p
  where p.id = p_owner_id
  for update;

  if not found then
    raise exception 'resource_not_found';
  end if;

  select r.is_locked, w.is_locked
    into v_resource_locked, v_workspace_locked
  from public.resources r
  join public.workspaces w on w.id = r.workspace_id
  where r.id = p_resource_id
    and r.owner_id = p_owner_id;

  if not found then
    raise exception 'resource_not_found';
  end if;

  if v_resource_locked or v_workspace_locked then
    raise exception 'resource_locked';
  end if;

  update public.resources r
  set image_path = p_path
  where r.id = p_resource_id
    and r.owner_id = p_owner_id;
end;
$$;

revoke execute on function public.set_resource_image(uuid, uuid, text) from public, anon, authenticated;
grant  execute on function public.set_resource_image(uuid, uuid, text) to service_role;
