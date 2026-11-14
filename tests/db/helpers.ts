// Shared helpers for the database tests (DATABASE.md section 10).
//
// Rules (owner decisions Q4 and the Batch C brief):
//  * Real paths only: service_role through supabase-js calling real functions,
//    owners as really logged-in users, anon = publishable key with no login.
//  * No direct Postgres connection and no extra grants.
//  * Never log or print any environment value or key.
//  * Test owners are created through the Auth admin API and deleted afterwards
//    (deleting the Auth user cascades to every row the owner has).

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { execSync } from 'node:child_process'
import { randomBytes, randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { expect } from '@playwright/test'
import type { Database } from '../../src/types/database.types'

export type Db = SupabaseClient<Database>

/** Email addresses of every test user start like this, so a sweep can find them. */
const TEST_EMAIL = /^slotmate-test-[0-9a-f-]+@example\.com$/

// -----------------------------------------------------------------------------
// Environment (names only; values are never printed)
// -----------------------------------------------------------------------------
function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing environment variable ${name} (expected in .env.local)`)
  }
  return value
}

const clientOptions = {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
}

/** Our server with the secret key (service_role). */
export function serviceClient(): Db {
  return createClient<Database>(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv('SUPABASE_SECRET_KEY'),
    clientOptions,
  )
}

/** Anyone calling Supabase with only the public key (role anon). */
export function anonClient(): Db {
  return createClient<Database>(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'),
    clientOptions,
  )
}

// -----------------------------------------------------------------------------
// Test owners (real Auth users)
// -----------------------------------------------------------------------------
export interface TestOwner {
  id: string
  email: string
  /** Logged in with a real password: role authenticated, RLS applies. */
  client: Db
}

const createdUserIds: string[] = []

export async function createOwner(): Promise<TestOwner> {
  const service = serviceClient()
  const email = `slotmate-test-${randomUUID()}@example.com`
  const password = `Aa1-${randomBytes(18).toString('base64url')}`

  const { data, error } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (error || !data.user) {
    throw new Error(`auth.admin.createUser failed: ${error?.message ?? 'no user returned'}`)
  }
  createdUserIds.push(data.user.id)

  const client = anonClient()
  const signIn = await client.auth.signInWithPassword({ email, password })
  if (signIn.error) {
    throw new Error(`signInWithPassword failed: ${signIn.error.message}`)
  }
  return { id: data.user.id, email, client }
}

/** Deletes one test owner (cascades to profile, subscription and everything else). */
export async function deleteOwner(id: string): Promise<void> {
  const { error } = await serviceClient().auth.admin.deleteUser(id)
  if (error && !/not found/i.test(error.message)) {
    throw new Error(`auth.admin.deleteUser failed: ${error.message}`)
  }
  const index = createdUserIds.indexOf(id)
  if (index >= 0) createdUserIds.splice(index, 1)
}

/** Deletes every owner this worker created. Call from afterAll in every spec file. */
export async function deleteCreatedOwners(): Promise<void> {
  const failures: string[] = []
  for (const id of [...createdUserIds]) {
    try {
      await deleteOwner(id)
    } catch (e) {
      failures.push(e instanceof Error ? e.message : String(e))
    }
  }
  if (failures.length > 0) {
    throw new Error(`Cleanup failed for ${failures.length} test user(s): ${failures[0]}`)
  }
}

/**
 * Safety net used by global teardown: deletes any leftover user whose email
 * looks like a test user. Returns how many were deleted.
 */
export async function sweepTestUsers(): Promise<number> {
  const service = serviceClient()
  let deleted = 0
  for (let page = 1; page < 50; page++) {
    const { data, error } = await service.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw new Error(`auth.admin.listUsers failed: ${error.message}`)
    const users = data.users
    for (const user of users) {
      if (user.email && TEST_EMAIL.test(user.email)) {
        await deleteOwner(user.id)
        deleted++
      }
    }
    if (users.length < 200) break
  }
  return deleted
}

// -----------------------------------------------------------------------------
// Test data built through real paths (owner login for owner data)
// -----------------------------------------------------------------------------
export interface BookableResource {
  workspaceId: string
  resourceId: string
  workspaceName: string
  resourceName: string
  /** A future date (UTC, YYYY-MM-DD). The workspace time zone is UTC. */
  day: string
}

/** A future calendar day in UTC. Always after "now" and well within 90 days. */
export function futureDay(daysAhead = 5): string {
  return new Date(Date.now() + daysAhead * 86_400_000).toISOString().slice(0, 10)
}

/** The exact start instant of the slot at the given UTC hour on a day. */
export function slotIso(day: string, hour: number): string {
  return `${day}T${String(hour).padStart(2, '0')}:00:00.000Z`
}

/**
 * Creates (as the owner, through RLS) a workspace in time zone UTC, a resource
 * with 60-minute slots and capacity 5, and opening hours 00:00-24:00 on all
 * seven weekdays, so every whole hour of any future day is a valid slot.
 */
export async function createBookableResource(
  owner: TestOwner,
  daysAhead = 5,
): Promise<BookableResource> {
  const tag = randomBytes(5).toString('hex')
  const workspaceName = `Test workspace ${tag}`
  const resourceName = `Test resource ${tag}`

  const workspace = await owner.client
    .from('workspaces')
    .insert({ owner_id: owner.id, name: workspaceName, slug: `t-${tag}`, time_zone: 'UTC' })
    .select('id')
    .single()
  if (workspace.error) throw new Error(`create workspace failed: ${workspace.error.message}`)

  const resource = await owner.client
    .from('resources')
    .insert({
      workspace_id: workspace.data.id,
      owner_id: owner.id,
      name: resourceName,
      slot_minutes: 60,
      capacity: 5,
    })
    .select('id')
    .single()
  if (resource.error) throw new Error(`create resource failed: ${resource.error.message}`)

  const availability = await owner.client.from('resource_availability').insert(
    [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({
      resource_id: resource.data.id,
      weekday,
      opens_at: '00:00',
      closes_at: '24:00',
    })),
  )
  if (availability.error) throw new Error(`create availability failed: ${availability.error.message}`)

  return {
    workspaceId: workspace.data.id,
    resourceId: resource.data.id,
    workspaceName,
    resourceName,
    day: futureDay(daysAhead),
  }
}

/** A random 32-byte status-token hash in PostgREST's bytea hex format. */
export function randomTokenHash(): string {
  return `\\x${randomBytes(32).toString('hex')}`
}

/** Valid arguments for submit_booking. */
export function bookingArgs(resourceId: string, startsAt: string) {
  return {
    p_resource_id: resourceId,
    p_starts_at: startsAt,
    p_visitor_name: 'Test Visitor',
    p_visitor_email: 'visitor@example.com',
    // The server passes NULL for an empty optional field.
    p_visitor_phone: null as unknown as string,
    p_note: null as unknown as string,
    p_attendees: 1,
    p_status_token_hash: randomTokenHash(),
  }
}

/** Books a slot as our server (service_role). Returns the new booking's id. */
export async function bookAsServer(
  service: Db,
  resourceId: string,
  startsAt: string,
): Promise<string> {
  const { data, error } = await service.rpc('submit_booking', bookingArgs(resourceId, startsAt))
  if (error || !data || data.length !== 1) {
    throw new Error(`submit_booking failed: ${error?.message ?? 'no row returned'}`)
  }
  return data[0].booking_id
}

/** The owner's monthly booking count, summed over all months (service_role read). */
export async function usageCount(service: Db, ownerId: string): Promise<number> {
  const { data, error } = await service
    .from('monthly_usage')
    .select('booking_count')
    .eq('owner_id', ownerId)
  if (error) throw new Error(`read monthly_usage failed: ${error.message}`)
  return data.reduce((sum, row) => sum + row.booking_count, 0)
}

/** How many bookings exist for a resource (service_role read of the allowed columns). */
export async function bookingCount(service: Db, resourceId: string): Promise<number> {
  const { data, error } = await service.from('bookings').select('id').eq('resource_id', resourceId)
  if (error) throw new Error(`read bookings failed: ${error.message}`)
  return data.length
}

// -----------------------------------------------------------------------------
// Assertions shared by several tests
// -----------------------------------------------------------------------------
interface Outcome {
  data: unknown
  error: { code?: string; message?: string } | null
}

/** The request was refused by the database for lack of privilege (SQLSTATE 42501). */
export function expectPermissionDenied(res: Outcome, label: string): void {
  expect(res.error, `${label}: expected a refusal`).not.toBeNull()
  expect(res.error?.code, `${label}: expected permission denied (42501)`).toBe('42501')
}

/** Either refused outright, or it matched no rows. Nothing was changed either way. */
export function expectNoEffect(res: Outcome, label: string): void {
  if (res.error) return
  expect(res.data, `${label}: expected no rows to be affected`).toEqual([])
}

/** Either refused for lack of privilege, or no rows came back. */
export function expectClosed(res: Outcome, label: string): void {
  if (res.error) {
    expect(res.error.code, `${label}: expected permission denied (42501)`).toBe('42501')
    return
  }
  expect(res.data, `${label}: expected no rows`).toEqual([])
}

// -----------------------------------------------------------------------------
// Read-only catalog SQL through the Supabase CLI (used by T6 and T7 only)
// -----------------------------------------------------------------------------
export function readOnlySql(sql: string): Record<string, unknown>[] {
  const dir = mkdtempSync(path.join(tmpdir(), 'slotmate-sql-'))
  const file = path.join(dir, 'query.sql')
  writeFileSync(file, sql)
  try {
    const stdout = execSync(`npx supabase db query --remote --read-only -f "${file}"`, {
      cwd: process.cwd(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 120_000,
    })
    const parsed = JSON.parse(stdout.slice(stdout.indexOf('{'))) as {
      rows: Record<string, unknown>[]
    }
    return parsed.rows
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
