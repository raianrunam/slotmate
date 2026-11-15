import { expect, test } from '@playwright/test'
import {
  bookAsServer,
  bookingArgs,
  bookingCount,
  createBookableResource,
  futureDay,
  createOwner,
  deleteCreatedOwners,
  serviceClient,
  slotIso,
  usageCount,
  type BookableResource,
  type Db,
  type TestOwner,
} from './helpers'

// T9 - The overlap rule through real paths (AVAIL-04, D10, BOOK-04, BOOK-05, DATABASE.md 7.1).
// Bookings are made by our server (service_role calling submit_booking); the owner changes
// their status as a really logged-in owner (RLS applies). No direct Postgres connection.
//
//  * a booking that OVERLAPS another with a DIFFERENT start is refused (slot_taken),
//    which shows the rule is an overlap rule and not "same start time";
//  * back-to-back bookings (one ends exactly when the next starts) are allowed;
//  * pending and approved hold the slot; rejected and cancelled free it; a deleted booking frees it.

test.describe('T9 overlap rule', () => {
  let service: Db
  let owner: TestOwner
  let data: BookableResource

  test.beforeAll(async () => {
    service = serviceClient()
    owner = await createOwner()
    data = await createBookableResource(owner) // 60-minute slots on the hour, open 00:00-24:00, UTC
  })

  test.afterAll(async () => {
    await deleteCreatedOwners()
  })

  const attempt = (startsAt: string) =>
    service.rpc('submit_booking', bookingArgs(data.resourceId, startsAt))

  const setStatus = (id: string, status: 'approved' | 'rejected' | 'cancelled') =>
    owner.client.from('bookings').update({ status }).eq('id', id).select('id, status')

  test('back-to-back bookings are allowed; the same slot twice is refused', async () => {
    const first = await bookAsServer(service, data.resourceId, slotIso(data.day, 10)) // 10:00-11:00
    expect(first).toBeTruthy()
    const next = await attempt(slotIso(data.day, 11)) // 11:00-12:00 starts exactly when the first ends
    expect(next.error, '11:00 starts when 10:00 ends: no overlap').toBeNull()
    const before = await attempt(slotIso(data.day, 9)) // 09:00-10:00 ends exactly when the first starts
    expect(before.error, '09:00 ends when 10:00 starts: no overlap').toBeNull()

    const same = await attempt(slotIso(data.day, 10))
    expect(same.error?.message).toBe('slot_taken')
  })

  test('a booking that overlaps another with a DIFFERENT start is refused, and refusing it leaves the monthly count alone', async () => {
    // The owner makes the slots 90 minutes long. Bookings made earlier keep their own length
    // (60 minutes); the new grid is 00:00, 01:30, 03:00 ... 15:00, 16:30 ...
    const changed = await owner.client.from('resources').update({ slot_minutes: 90 }).eq('id', data.resourceId).select('id')
    expect(changed.error).toBeNull()

    // Held from the first test: 09:00-10:00, 10:00-11:00, 11:00-12:00 (all on the 60-minute grid).
    // New 90-minute slots: 09:00-10:30 overlaps 09:00 and 10:00; 10:30-12:00 overlaps 10:00 and 11:00;
    // 12:00-13:30 overlaps nothing.
    const usageBefore = await usageCount(service, owner.id)
    const countBefore = await bookingCount(service, data.resourceId)

    const overlapsTwo = await attempt(`${data.day}T09:00:00.000Z`)
    expect(overlapsTwo.error?.message, '09:00-10:30 overlaps held bookings').toBe('slot_taken')
    const shifted = await attempt(`${data.day}T10:30:00.000Z`)
    expect(shifted.error?.message, '10:30-12:00 starts inside 10:00-11:00 and ends after 11:00 starts').toBe('slot_taken')

    expect(await usageCount(service, owner.id), 'a refused request uses no allowance').toBe(usageBefore)
    expect(await bookingCount(service, data.resourceId), 'a refused request saves nothing').toBe(countBefore)

    const free = await attempt(`${data.day}T12:00:00.000Z`)
    expect(free.error, '12:00-13:30 overlaps nothing').toBeNull()
    // Back-to-back on the new grid: 13:30-15:00 starts exactly when 12:00-13:30 ends.
    const backToBack = await attempt(`${data.day}T13:30:00.000Z`)
    expect(backToBack.error, '13:30 is back-to-back with 12:00-13:30').toBeNull()

    // Put the 60-minute slots back for the next tests.
    const restored = await owner.client.from('resources').update({ slot_minutes: 60 }).eq('id', data.resourceId).select('id')
    expect(restored.error).toBeNull()
  })

  test('pending and approved hold the slot; rejected frees it', async () => {
    // A fresh day, so this test does not depend on the others (a Free owner has one workspace).
    const day = futureDay(20)
    const at = (hour: number) => service.rpc('submit_booking', bookingArgs(data.resourceId, slotIso(day, hour)))

    const a = await at(3)
    expect(a.error).toBeNull()
    const id = a.data![0].booking_id
    expect((await at(3)).error?.message, 'pending holds the slot (D10)').toBe('slot_taken')

    const approved = await setStatus(id, 'approved')
    expect(approved.error).toBeNull()
    expect(approved.data).toHaveLength(1)
    expect((await at(3)).error?.message, 'approved holds the slot').toBe('slot_taken')

    // A different booking: reject it, the slot is free again for someone else.
    const b = await at(5)
    expect(b.error).toBeNull()
    expect((await at(5)).error?.message).toBe('slot_taken')
    const rejected = await setStatus(b.data![0].booking_id, 'rejected')
    expect(rejected.error).toBeNull()
    expect(rejected.data).toHaveLength(1)
    const again = await at(5)
    expect(again.error, 'a rejected booking frees its slot (BOOK-04)').toBeNull()
  })

  test('cancelling an approved booking frees the slot; a deleted booking frees it too; a freed slot can be taken only once', async () => {
    const day = futureDay(21)
    const at = (hour: number) => service.rpc('submit_booking', bookingArgs(data.resourceId, slotIso(day, hour)))

    const a = await at(8)
    expect(a.error).toBeNull()
    expect((await setStatus(a.data![0].booking_id, 'approved')).error).toBeNull()
    expect((await at(8)).error?.message).toBe('slot_taken')
    const cancelled = await setStatus(a.data![0].booking_id, 'cancelled')
    expect(cancelled.error).toBeNull()
    expect(cancelled.data).toHaveLength(1)

    const second = await at(8)
    expect(second.error, 'a cancelled booking frees its slot (BOOK-05)').toBeNull()
    // Two visitors race for the freed slot: the one that came first holds it.
    expect((await at(8)).error?.message).toBe('slot_taken')

    // Deleting a pending booking frees the slot as well (BOOK-06).
    const c = await at(12)
    expect(c.error).toBeNull()
    const deleted = await owner.client.from('bookings').delete().eq('id', c.data![0].booking_id).select('id')
    expect(deleted.data).toHaveLength(1)
    expect((await at(12)).error, 'a deleted booking frees its slot').toBeNull()
  })

  test('a rejected or cancelled booking cannot be revived to take a slot back', async () => {
    const day = futureDay(22)
    const at = (hour: number) => service.rpc('submit_booking', bookingArgs(data.resourceId, slotIso(day, hour)))
    const a = await at(2)
    expect(a.error).toBeNull()
    expect((await setStatus(a.data![0].booking_id, 'rejected')).data).toHaveLength(1)
    expect((await at(2)).error).toBeNull() // someone else booked the freed slot

    // The rejected booking cannot become pending/approved again, so it can never conflict later.
    const revive = await owner.client.from('bookings').update({ status: 'approved' }).eq('id', a.data![0].booking_id).select('id')
    expect(revive.error?.message).toBe('invalid_status_change')
    const stored = await service.from('bookings').select('status').eq('id', a.data![0].booking_id).single()
    expect(stored.data?.status, 'still rejected').toBe('rejected')
  })
})
