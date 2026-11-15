-- =============================================================================
-- SlotMate — Migration 8: rate_limit_lock_and_image_path
--
-- Two changes found by the Phase 11 review. Migrations 1-7 are NOT edited.
--
-- (a) check_rate_limit: a parallel burst could slip past the limit.
--     The function runs in READ COMMITTED, so simultaneous calls could not see
--     each other's uncommitted attempt rows, and a burst of N parallel requests
--     could all be allowed (a test run allowed 9 of 10). Fix: the FIRST statement
--     takes a transaction-level advisory lock keyed on (workspace, visitor hash).
--     Calls for the same visitor and workspace now run one after another; the
--     next call starts its delete/insert/count only after the previous one has
--     committed, so it sees the earlier rows. Calls for other visitors or other
--     workspaces use other lock keys and do not wait. The lock is released
--     automatically when the call's transaction ends.
--     Unchanged: SECURITY DEFINER, search_path '', the 10-minute window, the
--     limit of 5, "every attempt counts", the grants (service_role only).
--
-- (b) set_resource_image: the owner's id appeared in public image addresses.
--     The old path layout was <owner_id>/<resource_id>/<file>, and the bucket is
--     public, so anybody who saw an image address learned the owner's id
--     (a privacy finding). New layout: <resource_id>/<file>, where <file> is a
--     random name with an extension (made by the server). The path rule is now:
--       * must start with '<p_resource_id>/'
--       * the rest is ONE file name: letters, digits, '_' or '-' (1-100), a dot,
--         and an extension of 1-5 letters or digits (an allow-list: no '/', '%',
--         '?', '#', backslash or odd characters; review finding L2)
--       * must not contain '..'
--     Unchanged: the resource must belong to p_owner_id; neither the resource nor
--     its workspace may be locked; NULL removes the image; the profiles row is
--     locked first; only image_path changes; signature, SECURITY DEFINER,
--     search_path '' and grants (service_role only).
--     Only the new layout is accepted. This migration does not touch Storage
--     files or existing rows; the old-layout files of test users are deleted by
--     the application step that follows (not by SQL here).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- (a) check_rate_limit
-- ---------------------------------------------------------------------------
create or replace function public.check_rate_limit(p_workspace_id uuid, p_ip_hash bytea)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  -- FIRST statement: one call at a time per (workspace, visitor).
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      p_workspace_id::text || pg_catalog.encode(p_ip_hash, 'hex'),
      0
    )
  );

  delete from public.rate_limit_attempts a
  where a.id in (
    select o.id from public.rate_limit_attempts o
    where o.attempted_at <= pg_catalog.now() - interval '10 minutes'
    order by o.id
    limit 1000
    for update skip locked
  );

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

-- ---------------------------------------------------------------------------
-- (b) set_resource_image: path layout <resource_id>/<file>
-- ---------------------------------------------------------------------------
create or replace function public.set_resource_image(
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

  -- Path rule (see header): '<resource_id>/<file>', one file name, no '..'.
  -- NULL removes the image.
  if p_path is not null then
    v_prefix := p_resource_id::text || '/';

    if pg_catalog.left(p_path, pg_catalog.char_length(v_prefix)) <> v_prefix
       or pg_catalog.char_length(p_path) = pg_catalog.char_length(v_prefix)
       or p_path !~ ('^' || v_prefix || '[A-Za-z0-9_-]{1,100}\.[A-Za-z0-9]{1,5}$')
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
