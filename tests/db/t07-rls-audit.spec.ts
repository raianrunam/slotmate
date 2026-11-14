import { expect, test } from '@playwright/test'
import { readOnlySql } from './helpers'

// T7 - RLS audit. Query the catalog for tables in public without RLS.
// Expected: none. (ISO-01)
//
// Runs read-only SQL through "npx supabase db query --remote --read-only".

const EXPECTED_TABLES = [
  'bookings',
  'embed_configurations',
  'monthly_usage',
  'plan_limits',
  'profiles',
  'rate_limit_attempts',
  'resource_availability',
  'resources',
  'stripe_events',
  'subscriptions',
  'workspaces',
]

test('T7 every table in public has row level security enabled', () => {
  const tables = readOnlySql(`
    select c.relname as table_name, c.relrowsecurity as rls_enabled
    from pg_class c
    where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p')
    order by c.relname
  `) as unknown as { table_name: string; rls_enabled: boolean }[]

  // The audit must really see our 11 tables, otherwise "none without RLS" proves nothing.
  expect(tables.map((t) => t.table_name)).toEqual(EXPECTED_TABLES)
  expect(tables.filter((t) => !t.rls_enabled).map((t) => t.table_name)).toEqual([])
})

test('T7 (extra) no policy is granted to anon or PUBLIC', () => {
  const policies = readOnlySql(`
    select tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and ('anon' = any(roles) or 'public' = any(roles))
  `)
  expect(policies).toEqual([])
})
