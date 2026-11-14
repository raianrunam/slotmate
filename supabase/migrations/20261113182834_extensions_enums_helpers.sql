-- =============================================================================
-- SlotMate — Migration 1: extensions_enums_helpers
--
-- Implements docs/DATABASE.md:
--   §4.2  Extensions         btree_gist (needed by the exclusion constraint, DB4, §7.1)
--   §4.1  Enums (DB14)       plan_type, booking_status, embed_theme, embed_layout
--   §6.1  Rule 4             default-privilege hardening for future functions
--   §5.1  Rule 3             future tables and sequences in public start closed
--                            to anon and authenticated (grants follow in migration 7)
--   §4.4  set_updated_at()   trigger function, secured per §6.1 rules 2, 3 and 5
--
-- Order matters: the extension is created BEFORE the default privileges change,
-- so btree_gist's own functions keep their normal permissions.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Extension (§4.2)
-- Installed into the "extensions" schema (Supabase convention) so it is not
-- exposed through the public web API.
-- -----------------------------------------------------------------------------
create extension if not exists btree_gist with schema extensions;


-- -----------------------------------------------------------------------------
-- 2. Enums (§4.1, DB14)
-- -----------------------------------------------------------------------------
create type public.plan_type      as enum ('free', 'pro');
create type public.booking_status as enum ('pending', 'approved', 'rejected', 'cancelled');
create type public.embed_theme    as enum ('light', 'dark');
create type public.embed_layout   as enum ('list', 'grid');


-- -----------------------------------------------------------------------------
-- 3. Default privileges (§6.1 rule 4, §5.1 rule 3)
-- These apply to objects created LATER by the "postgres" role (the role that
-- runs our migrations). They do not change objects that already exist.
-- -----------------------------------------------------------------------------

-- 3a. Functions: remove PUBLIC's built-in EXECUTE right.
-- Must be the global form (no "in schema"): Postgres cannot revoke a global
-- default per schema. Applies to functions postgres creates in any schema.
alter default privileges for role postgres
  revoke execute on functions from public;

-- 3b. Functions in public: remove the EXECUTE grants Supabase gives its API roles.
alter default privileges for role postgres in schema public
  revoke execute on functions from anon, authenticated;

-- 3c. Tables and sequences in public: start closed to the browser roles.
-- service_role is intentionally left unchanged.
alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;

alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated;


-- -----------------------------------------------------------------------------
-- 4. set_updated_at() (§4.4)
-- Sets updated_at to the current time whenever a row is updated.
-- SECURITY INVOKER (the default): it only edits the row being saved and needs
-- no extra powers. Fixed empty search_path; every name is schema-qualified.
-- -----------------------------------------------------------------------------
create function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

-- §6.1 rule 5: same revoke treatment as every other function. No GRANT is
-- needed: triggers fire without checking EXECUTE (§6.2).
revoke execute on function public.set_updated_at() from public, anon, authenticated;
