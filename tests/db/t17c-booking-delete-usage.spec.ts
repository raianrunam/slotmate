import { expect, test } from '@playwright/test'
import {
  bookAsServer,
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

// T17 part 3 - Deleting bookings never lowers the month's count (D13, D19, BOOK-06, BILL-07,
// DATABASE.md 7.3). Bookings are made by our server (submit_booking, which raises the count);
// the owner deletes them as a really logged-in owner (RLS applies).
//
//  * the owner deletes one booking, then all the others: monthly_usage stays the same;
//  * a deleted booking frees its time (a new request for it is accepted) and that new request
//    raises the count again, so the count only ever goes up;
//  * another owner cannot delete the booking and the count does not move.

test.describe('T17 part 3: deleting bookings keeps the monthly count', () => {
  let service: Db
  let owner: TestOwner
  let other: TestOwner
  let data: BookableResource

  test.beforeAll(async () => {
    service = serviceClient()
    owner = await createOwner()
    other = await createOwner()
    data = await createBookableResource(owner)
  })

  test.afterAll(async () => {
    await deleteCreatedOwners()
  })

  test('deleting one booking and then all of them leaves monthly_usage unchanged', async () => {
    const ids: string[] = []
    for (let hour = 8; hour < 12; hour++) ids.push(await bookAsServer(service, data.resourceId, slotIso(data.day, hour)))
    expect(await usageCount(service, owner.id)).toBe(4)
    expect(await bookingCount(service, data.resourceId)).toBe(4)

    // Another owner cannot delete it: no row is visible to them, nothing moves.
    expect((await other.client.from('bookings').delete().eq('id', ids[0]).select('id')).data).toEqual([])
    expect(await bookingCount(service, data.resourceId)).toBe(4)
    expect(await usageCount(service, owner.id)).toBe(4)

    const one = await owner.client.from('bookings').delete().eq('id', ids[0]).select('id')
    expect(one.error).toBeNull()
    expect(one.data).toEqual([{ id: ids[0] }])
    expect(await bookingCount(service, data.resourceId)).toBe(3)
    expect(await usageCount(service, owner.id), 'one delete: the count is unchanged').toBe(4)

    const rest = await owner.client.from('bookings').delete().in('id', ids.slice(1)).select('id')
    expect(rest.error).toBeNull()
    expect(rest.data).toHaveLength(3)
    expect(await bookingCount(service, data.resourceId)).toBe(0)
    expect(await usageCount(service, owner.id), 'every booking deleted: the count is unchanged').toBe(4)
  })

  test('a deleted booking frees its time; a new request for it counts again', async () => {
    const before = await usageCount(service, owner.id)
    const first = await bookAsServer(service, data.resourceId, slotIso(data.day, 15))
    expect(await usageCount(service, owner.id)).toBe(before + 1)
    expect((await owner.client.from('bookings').delete().eq('id', first).select('id')).error).toBeNull()
    expect(await usageCount(service, owner.id), 'the delete did not give the request back').toBe(before + 1)
    await bookAsServer(service, data.resourceId, slotIso(data.day, 15)) // the time is free again
    expect(await usageCount(service, owner.id)).toBe(before + 2)
  })
})
