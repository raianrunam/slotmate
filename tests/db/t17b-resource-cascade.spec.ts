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
  type Db,
  type TestOwner,
} from './helpers'

// T17 part 2 - Deleting a resource (RES-03, D13, D19). The owner deletes one
// resource through their own login. Its opening hours and bookings go with it;
// the workspace and the monthly usage count stay. (The Storage files of a
// deleted resource are removed by the APP, before this delete: that is proved by
// the UI test "deleting a resource deletes its image file".)

test.describe('T17 part 2: resource delete cascade', () => {
  let owner: TestOwner
  let service: Db

  test.beforeAll(async () => {
    service = serviceClient()
    owner = await createOwner()
  })

  test.afterAll(async () => {
    await deleteCreatedOwners()
  })

  test('deleting a resource removes its availability and bookings; workspace and usage stay', async () => {
    const data = await createBookableResource(owner)
    await bookAsServer(service, data.resourceId, slotIso(data.day, 9))
    await bookAsServer(service, data.resourceId, slotIso(data.day, 10))

    // Before: everything exists, so the "gone" checks mean something.
    const hoursBefore = await service.from('resource_availability').select('id').eq('resource_id', data.resourceId)
    expect(hoursBefore.data).toHaveLength(7)
    expect(await bookingCount(service, data.resourceId)).toBe(2)
    expect(await usageCount(service, owner.id)).toBe(2)

    const del = await owner.client.from('resources').delete().eq('id', data.resourceId).select('id')
    expect(del.error).toBeNull()
    expect(del.data).toHaveLength(1)

    const resource = await service.from('resources').select('id').eq('id', data.resourceId)
    expect(resource.data, 'resource gone').toEqual([])
    const hours = await service.from('resource_availability').select('id').eq('resource_id', data.resourceId)
    expect(hours.data, 'availability gone').toEqual([])
    expect(await bookingCount(service, data.resourceId), 'bookings gone').toBe(0)

    const workspace = await service.from('workspaces').select('id').eq('id', data.workspaceId)
    expect(workspace.data, 'the workspace stays').toHaveLength(1)
    expect(await usageCount(service, owner.id), 'monthly usage stays (D19)').toBe(2)
  })

  test("an owner cannot delete another owner's resource", async () => {
    const other = await createOwner()
    const theirs = await createBookableResource(other)
    const del = await owner.client.from('resources').delete().eq('id', theirs.resourceId).select('id')
    expect(del.error ?? null).toBeNull()
    expect(del.data, 'nothing was deleted').toEqual([])
    const still = await service.from('resources').select('id').eq('id', theirs.resourceId)
    expect(still.data).toHaveLength(1)
  })
})
