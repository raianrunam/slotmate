import { expect, test } from '@playwright/test'
import { readOnlySql } from './helpers'

// T6 - Function permissions audit. Query the catalog for every function in
// public and its EXECUTE privileges; check each has a fixed search_path.
// Expected: none executable by PUBLIC, anon or authenticated; all have
// search_path set. (DATABASE.md section 6.1; the allow-list is EMPTY.)
//
// Runs read-only SQL through "npx supabase db query --remote --read-only".

// Functions our server (service_role) may call directly (DATABASE.md 6.2 plus
// set_resource_image, owner decision Q2). Trigger functions are not callable by anyone.
const SERVER_ONLY_FUNCTIONS = [
  'apply_downgrade_selection',
  'check_rate_limit',
  'claim_stripe_event',
  'current_plan',
  'mark_stripe_event_processed',
  'reconcile_locks',
  'set_resource_image',
  'submit_booking',
]

interface FunctionRow {
  proname: string
  anon_can_execute: boolean
  authenticated_can_execute: boolean
  public_can_execute: boolean
  service_role_can_execute: boolean
  has_fixed_search_path: boolean
}

test('T6 no function in public is executable by PUBLIC, anon or authenticated; all have a fixed search_path', () => {
  const rows = readOnlySql(`
    select p.proname,
           has_function_privilege('anon', p.oid, 'execute')          as anon_can_execute,
           has_function_privilege('authenticated', p.oid, 'execute') as authenticated_can_execute,
           exists (
             select 1
             from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
             where a.grantee = 0 and a.privilege_type = 'EXECUTE'
           )                                                          as public_can_execute,
           has_function_privilege('service_role', p.oid, 'execute')  as service_role_can_execute,
           coalesce(
             exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%'),
             false
           )                                                          as has_fixed_search_path
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace
    order by p.proname
  `) as unknown as FunctionRow[]

  expect(rows.length, 'the audit must find the functions').toBeGreaterThan(0)

  const offenders = (pick: (r: FunctionRow) => boolean) =>
    rows.filter(pick).map((r) => r.proname)

  expect(offenders((r) => r.public_can_execute), 'executable by PUBLIC').toEqual([])
  expect(offenders((r) => r.anon_can_execute), 'executable by anon').toEqual([])
  expect(offenders((r) => r.authenticated_can_execute), 'executable by authenticated').toEqual([])
  expect(offenders((r) => !r.has_fixed_search_path), 'missing a fixed search_path').toEqual([])

  // Only the documented server-only functions are callable by service_role.
  expect(
    rows
      .filter((r) => r.service_role_can_execute)
      .map((r) => r.proname)
      .sort(),
    'functions callable by service_role',
  ).toEqual([...SERVER_ONLY_FUNCTIONS].sort())
})
