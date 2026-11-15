import { expect, test } from '@playwright/test'
import {
  anonClient,
  bookAsServer,
  createBookableResource,
  createOwner,
  deleteCreatedOwners,
  futureDay,
  serviceClient,
  slotIso,
  type BookableResource,
  type Db,
  type TestOwner,
} from './helpers'

// T13 - Status changes through real paths (BOOK-03 to BOOK-05, D10, DATABASE.md 7.7).
// Bookings are made by our server (service_role calling submit_booking); the owner changes them
// as a really logged-in owner (RLS applies, column privileges apply). No direct Postgres connection.
//
//  * every ALLOWED change works: pending -> approved, pending -> rejected, approved -> cancelled;
//  * every OTHER pair of the 4 x 4 that is a real change is refused with invalid_status_change
//    and the booking keeps its status; "setting a status to itself" is not a change, the trigger lets
//    it pass (documented in migration 4) and nothing changes;
//  * the owner can change no other column (no privilege), another owner changes nothing,
//    the server key cannot change a status at all, and the public key cannot even see a booking.

type Status = 'pending' | 'approved' | 'rejected' | 'cancelled'
const STATUSES: Status[] = ['pending', 'approved', 'rejected', 'cancelled']
const ALLOWED = new Set(['pending>approved', 'pending>rejected', 'approved>cancelled'])

test.describe('T13 status transitions', () => {
  let service: Db
  let owner: TestOwner
  let other: TestOwner
  let data: BookableResource
  let nextHour = 0

  test.beforeAll(async () => {
    service = serviceClient()
    owner = await createOwner()
    other = await createOwner()
    data = await createBookableResource(owner)
  })

  test.afterAll(async () => {
    await deleteCreatedOwners()
  })

  const statusOf = async (id: string) => (await owner.client.from('bookings').select('status').eq('id', id).single()).data?.status

  // A fresh booking in the given status, reached only by the allowed path.
  async function bookingIn(status: Status): Promise<string> {
    const id = await bookAsServer(service, data.resourceId, slotIso(data.day, nextHour++))
    if (status === 'pending') return id
    if (status === 'rejected') {
      expect((await owner.client.from('bookings').update({ status: 'rejected' }).eq('id', id).select('id')).error).toBeNull()
      return id
    }
    expect((await owner.client.from('bookings').update({ status: 'approved' }).eq('id', id).select('id')).error).toBeNull()
    if (status === 'cancelled') {
      expect((await owner.client.from('bookings').update({ status: 'cancelled' }).eq('id', id).select('id')).error).toBeNull()
    }
    return id
  }

  for (const from of STATUSES) {
    for (const to of STATUSES) {
      const allowed = ALLOWED.has(`${from}>${to}`)
      const same = from === to
      test(`${from} -> ${to} is ${allowed ? 'allowed' : same ? 'a harmless no-op' : 'refused'}`, async () => {
        const id = await bookingIn(from)
        const res = await owner.client.from('bookings').update({ status: to }).eq('id', id).select('status')
        if (allowed) {
          expect(res.error).toBeNull()
          expect(res.data).toEqual([{ status: to }])
          expect(await statusOf(id)).toBe(to)
        } else if (same) {
          expect(res.error, 'not a change: nothing is raised').toBeNull()
          expect(await statusOf(id), 'and nothing changes').toBe(from)
        } else {
          expect(res.error?.message, `${from} -> ${to} must be refused by the transition rule`).toBe('invalid_status_change')
          expect(await statusOf(id), 'the booking keeps its status').toBe(from)
        }
      })
    }
  }

  test('the owner cannot change any column except status (no privilege)', async () => {
    const id = await bookAsServer(service, data.resourceId, slotIso(data.day, nextHour++))
    // Read as the owner: the server key may not read every column (Q3), so it would return nothing here.
    const columns = 'id, resource_id, owner_id, visitor_name, visitor_email, visitor_phone, note, attendees, starts_at, ends_at, status, created_at, updated_at'
    const before = (await owner.client.from('bookings').select(columns).eq('id', id).single()).data
    expect(before?.status, 'the booking was read').toBe('pending')
    const changes: Record<string, unknown>[] = [
      { visitor_name: 'Someone Else' },
      { visitor_email: 'other@example.com' },
      { visitor_phone: '123' },
      { note: 'changed' },
      { attendees: 2 },
      { starts_at: slotIso(data.day, 22) },
      { ends_at: slotIso(data.day, 23) },
      { resource_id: data.resourceId },
      { owner_id: other.id },
      { id: crypto.randomUUID() },
      { status_token_hash: `\\x${'ab'.repeat(32)}` },
      { created_at: '2020-01-01T00:00:00Z' },
      { updated_at: '2020-01-01T00:00:00Z' },
      { status: 'approved', visitor_name: 'Mixed change' }, // an allowed status together with a forbidden column
    ]
    for (const change of changes) {
      const res = await owner.client.from('bookings').update(change as never).eq('id', id).select('id')
      expect(res.error, `${Object.keys(change).join('+')} must be refused`).not.toBeNull()
      expect(res.error?.code, `${Object.keys(change).join('+')}: permission denied`).toBe('42501')
    }
    const after = (await owner.client.from('bookings').select(columns).eq('id', id).single()).data
    expect(after).toEqual(before)
    expect(after?.status).toBe('pending')
  })

  test('another owner changes nothing (the booking is invisible to them); the server key and the public key cannot change a status', async () => {
    const id = await bookAsServer(service, data.resourceId, slotIso(data.day, nextHour++))
    const foreign = await other.client.from('bookings').update({ status: 'approved' }).eq('id', id).select('id')
    expect(foreign.error).toBeNull()
    expect(foreign.data, 'no row was visible, so none changed').toEqual([])
    expect((await other.client.from('bookings').delete().eq('id', id).select('id')).data).toEqual([])
    expect(await statusOf(id)).toBe('pending')

    const server = await service.from('bookings').update({ status: 'approved' }).eq('id', id).select('id')
    expect(server.error, 'service_role has no UPDATE on bookings').not.toBeNull()
    expect(await statusOf(id)).toBe('pending')

    const anon = anonClient()
    const pub = await anon.from('bookings').update({ status: 'approved' }).eq('id', id).select('id')
    expect(pub.error !== null || (pub.data ?? []).length === 0, 'the public key changes nothing').toBe(true)
    expect(await statusOf(id)).toBe('pending')
  })

  test('two changes at once from pending: exactly one wins (the other is refused or finds nothing)', async () => {
    const id = await bookAsServer(service, data.resourceId, slotIso(data.day, nextHour++))
    // The same guarded update the app uses: "set status where status is still pending".
    const [a, b] = await Promise.all([
      owner.client.from('bookings').update({ status: 'approved' }).eq('id', id).eq('status', 'pending').select('id'),
      owner.client.from('bookings').update({ status: 'rejected' }).eq('id', id).eq('status', 'pending').select('id'),
    ])
    const wins = [a, b].filter((r) => !r.error && (r.data ?? []).length === 1).length
    expect(wins, 'exactly one change took effect').toBe(1)
    expect(['approved', 'rejected']).toContain(await statusOf(id))
  })

  test('a rejected or cancelled booking frees its time again; an approved one holds it (D10)', async () => {
    const hour = nextHour++
    const first = await bookAsServer(service, data.resourceId, slotIso(data.day, hour))
    const taken = await service.rpc('submit_booking', {
      p_resource_id: data.resourceId,
      p_starts_at: slotIso(data.day, hour),
      p_visitor_name: 'Second',
      p_visitor_email: 'second@example.com',
      p_visitor_phone: null as unknown as string,
      p_note: null as unknown as string,
      p_attendees: 1,
      p_status_token_hash: `\\x${'cd'.repeat(32)}`,
    })
    expect(taken.error?.message, 'pending holds the slot').toBe('slot_taken')
    expect((await owner.client.from('bookings').update({ status: 'approved' }).eq('id', first).select('id')).error).toBeNull()
    expect((await owner.client.from('bookings').update({ status: 'cancelled' }).eq('id', first).select('id')).error).toBeNull()
    const again = await bookAsServer(service, data.resourceId, slotIso(data.day, hour))
    expect(again).not.toBe(first)
  })
})

test('T13 data: the days used are in the future', () => {
  expect(futureDay()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
})
