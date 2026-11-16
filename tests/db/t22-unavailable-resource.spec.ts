import { expect, test } from '@playwright/test'
import {
  bookAsServer,
  bookingArgs,
  bookingCount,
  createBookableResource,
  createOwner,
  deleteCreatedOwners,
  serviceClient,
  slotIso,
  usageCount,
  type BookableResource,
  type Db,
  type TestOwner,
} from './helpers'

// T22 - A resource that is switched off cannot be booked, even by the server (RES-06, AVAIL-05).
// The server key calls the real submit_booking; the owner switches the resource off as a really
// logged-in owner (RLS applies). No direct Postgres connection, no extra grants.

test.describe('T22 unavailable resource', () => {
  let service: Db
  let owner: TestOwner
  let data: BookableResource

  test.beforeAll(async () => {
    service = serviceClient()
    owner = await createOwner()
    data = await createBookableResource(owner)
  })

  test.afterAll(async () => {
    await deleteCreatedOwners()
  })

  const setAvailable = (value: boolean) =>
    owner.client.from('resources').update({ is_available: value }).eq('id', data.resourceId).select('id, is_available')

  test('submit_booking refuses a resource that is switched off (not_bookable); nothing is created or counted; switching on works again', async () => {
    const before = await bookingCount(service, data.resourceId)
    const usageBefore = await usageCount(service, owner.id)

    const off = await setAvailable(false)
    expect(off.error).toBeNull()
    expect(off.data?.[0]?.is_available).toBe(false)

    const refused = await service.rpc('submit_booking', bookingArgs(data.resourceId, slotIso(data.day, 14)))
    expect(refused.error?.message).toBe('not_bookable')
    expect(await bookingCount(service, data.resourceId)).toBe(before)
    expect(await usageCount(service, owner.id)).toBe(usageBefore)

    const on = await setAvailable(true)
    expect(on.error).toBeNull()
    const allowed = await service.rpc('submit_booking', bookingArgs(data.resourceId, slotIso(data.day, 14)))
    expect(allowed.error).toBeNull()
  })

  test('switching a resource off leaves its existing bookings unchanged (same rows, same status, same times)', async () => {
    const a = await bookAsServer(service, data.resourceId, slotIso(data.day, 9))
    const b = await bookAsServer(service, data.resourceId, slotIso(data.day, 10))
    const approve = await owner.client.from('bookings').update({ status: 'approved' }).eq('id', b).select('id')
    expect(approve.error).toBeNull()

    const read = async () => {
      const res = await owner.client
        .from('bookings')
        .select('id, status, starts_at, ends_at, visitor_name')
        .in('id', [a, b])
        .order('id')
      expect(res.error).toBeNull()
      return res.data
    }
    const before = await read()
    expect(before).toHaveLength(2)

    const off = await setAvailable(false)
    expect(off.error).toBeNull()
    expect(await read()).toEqual(before)

    const on = await setAvailable(true)
    expect(on.error).toBeNull()
    expect(await read()).toEqual(before)
  })
})
