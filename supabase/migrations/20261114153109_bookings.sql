-- =============================================================================
-- SlotMate — Migration 4: bookings
--
-- Implements docs/DATABASE.md:
--   §3.7  bookings table, checks and indexes (PUB-06, BOOK-01..08, ISO-03)
--   §7.1  exclusion constraint — the double-booking guarantee (DB4, PERF-03)
--   §7.5  status_token_hash (A8)
--   §7.7  enforce_booking_transition() (BOOK-03..05)
--
-- RLS is enabled here (§9). Grants and policies: migration 7.
-- Nobody inserts bookings directly: only submit_booking (migration 6).
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. bookings (§3.7)
-- -----------------------------------------------------------------------------
create table public.bookings (
  id                uuid primary key default gen_random_uuid(),
  resource_id       uuid not null,
  owner_id          uuid not null,           -- copy of the resource owner (DB3)
  visitor_name      text not null,
  visitor_email     text not null,
  visitor_phone     text,
  note              text,
  attendees         integer not null,
  starts_at         timestamptz not null,
  ends_at           timestamptz not null,    -- computed by submit_booking
  status            public.booking_status not null default 'pending',
  status_token_hash bytea not null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  -- DB3: the pair must match a resource row, so the owner copy cannot drift.
  constraint bookings_resource_owner_fkey
    foreign key (resource_id, owner_id)
    references public.resources (id, owner_id) on delete cascade,

  -- §7.5: one booking per status link; also the status-page lookup index.
  constraint bookings_status_token_hash_key unique (status_token_hash),

  constraint bookings_ends_after_starts
    check (ends_at > starts_at),
  -- Upper bound is the resource's capacity (another table): submit_booking checks it.
  constraint bookings_attendees_min
    check (attendees >= 1),
  constraint bookings_visitor_name_length
    check (char_length(btrim(visitor_name)) between 1 and 100),
  constraint bookings_visitor_email_format
    check (char_length(visitor_email) between 3 and 254
           and strpos(visitor_email, '@') > 0),
  constraint bookings_visitor_phone_length
    check (visitor_phone is null or char_length(visitor_phone) <= 30),
  constraint bookings_note_length
    check (note is null or char_length(note) <= 1000),
  constraint bookings_status_token_hash_length
    check (octet_length(status_token_hash) = 32),

  -- §7.1 (DB4): for the same resource, no two PENDING-or-APPROVED bookings may
  -- have overlapping time ranges. '[)' = start included, end excluded, so
  -- back-to-back bookings do not overlap. Rejected/cancelled rows are ignored,
  -- so their slot is free again. Needs btree_gist for "uuid =" (migration 1).
  constraint bookings_no_overlap
    exclude using gist (
      resource_id with =,
      tstzrange(starts_at, ends_at, '[)') with &&
    ) where (status in ('pending', 'approved'))
);

alter table public.bookings enable row level security;

-- §3.7 indexes (the exclusion constraint and the unique token index exist above).
create index bookings_owner_created_idx
  on public.bookings (owner_id, created_at desc, id desc);   -- BOOK-01, PERF-02
create index bookings_owner_status_idx
  on public.bookings (owner_id, status);                     -- BOOK-07, DASH-04, NOTIF-02
create index bookings_resource_id_idx
  on public.bookings (resource_id);                          -- cascades, ANLT-04

create trigger bookings_set_updated_at
  before update on public.bookings
  for each row
  execute function public.set_updated_at();


-- -----------------------------------------------------------------------------
-- 2. enforce_booking_transition() (§4.4, §7.7, BOOK-03..05)
-- Allows only: pending -> approved, pending -> rejected, approved -> cancelled.
-- Applies to EVERY role, including service_role.
-- FLAG: an UPDATE that sets status to its current value is not a "change" and
-- is allowed (the trigger only fires on UPDATE OF status anyway).
-- SECURITY INVOKER: it only compares OLD and NEW.
-- -----------------------------------------------------------------------------
create function public.enforce_booking_transition()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  if (old.status = 'pending'::public.booking_status  and new.status = 'approved'::public.booking_status)
  or (old.status = 'pending'::public.booking_status  and new.status = 'rejected'::public.booking_status)
  or (old.status = 'approved'::public.booking_status and new.status = 'cancelled'::public.booking_status) then
    return new;
  end if;

  raise exception 'invalid_status_change';
end;
$$;

revoke execute on function public.enforce_booking_transition() from public, anon, authenticated;

create trigger bookings_enforce_status_transition
  before update of status on public.bookings
  for each row
  execute function public.enforce_booking_transition();
