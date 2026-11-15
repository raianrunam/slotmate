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

// T17 part 1 - Deleting a workspace (WORK-03, D13, D19). The owner deletes
// their workspace through their own login. Everything underneath goes: embed
// settings, resources, opening hours and bookings. The monthly usage counter
// stays (deleted requests still count, D19).
// Part 2 (resource delete, account delete, Storage images) is still planned.

test.describe('T17 part 1: workspace delete cascade', () => {
  let owner: TestOwner
  let service: Db

  test.beforeAll(async () => {
    service = serviceClient()
    owner = await createOwner()
  })

  test.afterAll(async () => {
    await deleteCreatedOwners()
  })

  test('deleting a workspace removes embed row, resources, availability and bookings; usage stays', async () => {
    const data = await createBookableResource(owner)
    await bookAsServer(service, data.resourceId, slotIso(data.day, 9))
    await bookAsServer(service, data.resourceId, slotIso(data.day, 10))

    // Before: everything exists (this makes the "gone" checks meaningful).
    const embedBefore = await service.from('embed_configurations').select('workspace_id').eq('workspace_id', data.workspaceId)
    expect(embedBefore.data, 'a default embed row exists').toHaveLength(1)
    const resourcesBefore = await service.from('resources').select('id').eq('workspace_id', data.workspaceId)
    expect(resourcesBefore.data).toHaveLength(1)
    const hoursBefore = await service.from('resource_availability').select('id').eq('resource_id', data.resourceId)
    expect(hoursBefore.data).toHaveLength(7)
    expect(await bookingCount(service, data.resourceId)).toBe(2)
    expect(await usageCount(service, owner.id)).toBe(2)

    const del = await owner.client.from('workspaces').delete().eq('id', data.workspaceId).select('id')
    expect(del.error).toBeNull()
    expect(del.data).toHaveLength(1)

    const workspace = await service.from('workspaces').select('id').eq('id', data.workspaceId)
    expect(workspace.data).toEqual([])
    const embed = await service.from('embed_configurations').select('workspace_id').eq('workspace_id', data.workspaceId)
    expect(embed.data, 'embed row gone').toEqual([])
    const resources = await service.from('resources').select('id').eq('workspace_id', data.workspaceId)
    expect(resources.data, 'resources gone').toEqual([])
    const hours = await service.from('resource_availability').select('id').eq('resource_id', data.resourceId)
    expect(hours.data, 'availability gone').toEqual([])
    expect(await bookingCount(service, data.resourceId), 'bookings gone').toBe(0)

    expect(await usageCount(service, owner.id), 'monthly usage stays (D19)').toBe(2)
  })
})
