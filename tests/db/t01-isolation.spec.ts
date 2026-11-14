import { expect, test } from '@playwright/test'
import {
  bookAsServer,
  createBookableResource,
  createOwner,
  deleteCreatedOwners,
  expectNoEffect,
  expectPermissionDenied,
  serviceClient,
  slotIso,
  usageCount,
  type BookableResource,
  type Db,
  type TestOwner,
} from './helpers'

// T1 - Two owners, A and B. A tries to list, read, update and delete B's
// workspaces, resources, availability, bookings, embed settings, usage and
// subscription, using A's own login directly against the database.
// Expected: zero rows returned; updates and deletes change nothing. (ISO-01)

test.describe('T1 owner isolation', () => {
  let service: Db
  let a: TestOwner
  let b: TestOwner
  let aData: BookableResource
  let bData: BookableResource
  let aBookingId: string
  let bBookingId: string

  test.beforeAll(async () => {
    service = serviceClient()
    a = await createOwner()
    b = await createOwner()
    aData = await createBookableResource(a)
    bData = await createBookableResource(b)
    // Bookings can only be created by our server (submit_booking), never by an owner.
    aBookingId = await bookAsServer(service, aData.resourceId, slotIso(aData.day, 10))
    bBookingId = await bookAsServer(service, bData.resourceId, slotIso(bData.day, 10))
  })

  test.afterAll(async () => {
    await deleteCreatedOwners()
  })

  test('positive control: A sees exactly A\'s own rows', async () => {
    const workspaces = await a.client.from('workspaces').select('id')
    expect(workspaces.error).toBeNull()
    expect(workspaces.data?.map((r) => r.id)).toEqual([aData.workspaceId])

    const resources = await a.client.from('resources').select('id')
    expect(resources.data?.map((r) => r.id)).toEqual([aData.resourceId])

    const bookings = await a.client.from('bookings').select('id')
    expect(bookings.data?.map((r) => r.id)).toEqual([aBookingId])

    const subscriptions = await a.client.from('subscriptions').select('owner_id')
    expect(subscriptions.data?.map((r) => r.owner_id)).toEqual([a.id])

    const profiles = await a.client.from('profiles').select('id')
    expect(profiles.data?.map((r) => r.id)).toEqual([a.id])

    const usage = await a.client.from('monthly_usage').select('owner_id')
    expect(usage.data?.map((r) => r.owner_id)).toEqual([a.id])
  })

  test('A cannot read any of B\'s rows', async () => {
    const reads = {
      workspaces: await a.client.from('workspaces').select('id').eq('id', bData.workspaceId),
      resources: await a.client.from('resources').select('id').eq('id', bData.resourceId),
      resource_availability: await a.client
        .from('resource_availability')
        .select('id')
        .eq('resource_id', bData.resourceId),
      bookings: await a.client.from('bookings').select('id').eq('id', bBookingId),
      embed_configurations: await a.client
        .from('embed_configurations')
        .select('workspace_id')
        .eq('workspace_id', bData.workspaceId),
      monthly_usage: await a.client.from('monthly_usage').select('owner_id').eq('owner_id', b.id),
      subscriptions: await a.client.from('subscriptions').select('owner_id').eq('owner_id', b.id),
      profiles: await a.client.from('profiles').select('id').eq('id', b.id),
    }
    for (const [table, res] of Object.entries(reads)) {
      expect(res.error, `read ${table}`).toBeNull()
      expect(res.data, `read ${table}: zero rows expected`).toEqual([])
    }
  })

  test('A cannot update any of B\'s rows', async () => {
    const updates = {
      workspaces: await a.client
        .from('workspaces')
        .update({ name: 'hacked' })
        .eq('id', bData.workspaceId)
        .select('id'),
      resources: await a.client
        .from('resources')
        .update({ name: 'hacked' })
        .eq('id', bData.resourceId)
        .select('id'),
      resource_availability: await a.client
        .from('resource_availability')
        .update({ closes_at: '10:00' })
        .eq('resource_id', bData.resourceId)
        .select('id'),
      bookings: await a.client
        .from('bookings')
        .update({ status: 'approved' })
        .eq('id', bBookingId)
        .select('id'),
      embed_configurations: await a.client
        .from('embed_configurations')
        .update({ theme: 'dark' })
        .eq('workspace_id', bData.workspaceId)
        .select('workspace_id'),
      // No update privilege at all on these three: refused outright.
      monthly_usage: await a.client
        .from('monthly_usage')
        .update({ booking_count: 0 })
        .eq('owner_id', b.id)
        .select('owner_id'),
      subscriptions: await a.client
        .from('subscriptions')
        .update({ plan: 'pro' })
        .eq('owner_id', b.id)
        .select('owner_id'),
    }
    for (const [table, res] of Object.entries(updates)) {
      expectNoEffect(res, `update ${table}`)
    }
  })

  test('A cannot delete any of B\'s rows', async () => {
    const deletes = {
      bookings: await a.client.from('bookings').delete().eq('id', bBookingId).select('id'),
      resource_availability: await a.client
        .from('resource_availability')
        .delete()
        .eq('resource_id', bData.resourceId)
        .select('id'),
      resources: await a.client.from('resources').delete().eq('id', bData.resourceId).select('id'),
      workspaces: await a.client
        .from('workspaces')
        .delete()
        .eq('id', bData.workspaceId)
        .select('id'),
      // No delete privilege at all on these four: refused outright.
      embed_configurations: await a.client
        .from('embed_configurations')
        .delete()
        .eq('workspace_id', bData.workspaceId)
        .select('workspace_id'),
      monthly_usage: await a.client
        .from('monthly_usage')
        .delete()
        .eq('owner_id', b.id)
        .select('owner_id'),
      subscriptions: await a.client
        .from('subscriptions')
        .delete()
        .eq('owner_id', b.id)
        .select('owner_id'),
      profiles: await a.client.from('profiles').delete().eq('id', b.id).select('id'),
    }
    for (const [table, res] of Object.entries(deletes)) {
      expectNoEffect(res, `delete ${table}`)
    }
  })

  test('A cannot create rows that belong to B', async () => {
    // Pretending to be B when creating a workspace.
    const workspace = await a.client
      .from('workspaces')
      .insert({ owner_id: b.id, name: 'fake', slug: `fake-${bData.workspaceId.slice(0, 8)}`, time_zone: 'UTC' })
      .select('id')
    expect(workspace.error, 'insert workspace as B').not.toBeNull()

    // Adding a resource to B's workspace.
    const resource = await a.client
      .from('resources')
      .insert({
        workspace_id: bData.workspaceId,
        owner_id: b.id,
        name: 'fake',
        slot_minutes: 60,
        capacity: 1,
      })
      .select('id')
    expect(resource.error, 'insert resource into B\'s workspace').not.toBeNull()

    // Bookings can never be inserted by an owner.
    const booking = await a.client.from('bookings').insert({
      resource_id: aData.resourceId,
      owner_id: a.id,
      visitor_name: 'x',
      visitor_email: 'x@example.com',
      attendees: 1,
      starts_at: slotIso(aData.day, 12),
      ends_at: slotIso(aData.day, 13),
      status_token_hash: `\\x${'00'.repeat(32)}`,
    })
    expectPermissionDenied(booking, 'insert booking as owner')
  })

  test('B\'s data is exactly as it was (checked as our server and as B)', async () => {
    const workspace = await service
      .from('workspaces')
      .select('name')
      .eq('id', bData.workspaceId)
      .single()
    expect(workspace.data?.name).toBe(bData.workspaceName)

    const resource = await service
      .from('resources')
      .select('name')
      .eq('id', bData.resourceId)
      .single()
    expect(resource.data?.name).toBe(bData.resourceName)

    const availability = await service
      .from('resource_availability')
      .select('closes_at')
      .eq('resource_id', bData.resourceId)
    expect(availability.data).toHaveLength(7)
    expect(availability.data?.every((row) => row.closes_at === '24:00:00')).toBe(true)

    const booking = await service.from('bookings').select('status').eq('id', bBookingId).single()
    expect(booking.data?.status).toBe('pending')

    const embed = await service
      .from('embed_configurations')
      .select('theme')
      .eq('workspace_id', bData.workspaceId)
      .single()
    expect(embed.data?.theme).toBe('light')

    const subscription = await service
      .from('subscriptions')
      .select('plan')
      .eq('owner_id', b.id)
      .single()
    expect(subscription.data?.plan).toBe('free')

    expect(await usageCount(service, b.id)).toBe(1)

    // B's profile can only be read as B (our server has no privilege on profiles).
    const profile = await b.client.from('profiles').select('id')
    expect(profile.data?.map((r) => r.id)).toEqual([b.id])

    // B still has exactly one workspace and one resource.
    const workspaces = await service.from('workspaces').select('id').eq('owner_id', b.id)
    expect(workspaces.data).toHaveLength(1)
    const resources = await service.from('resources').select('id').eq('owner_id', b.id)
    expect(resources.data).toHaveLength(1)
  })
})
