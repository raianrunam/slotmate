import { randomBytes } from 'node:crypto'
import { expect, test } from '@playwright/test'
import {
  bookAsServer,
  createBookableResource,
  createOwner,
  deleteCreatedOwners,
  serviceClient,
  slotIso,
  type BookableResource,
  type Db,
  type TestOwner,
} from './helpers'

// T20 - Time zone (D7, A11, DATABASE.md 7.9).
//  * A name that is not a real zone is refused, on insert and on update.
//  * A missing zone is refused (DB10: no default).
//  * Changing a workspace's zone keeps every booking's exact moment.

test.describe('T20 workspace time zone', () => {
  let owner: TestOwner
  let service: Db
  let data: BookableResource

  test.beforeAll(async () => {
    service = serviceClient()
    owner = await createOwner()
    data = await createBookableResource(owner) // zone UTC
  })

  test.afterAll(async () => {
    await deleteCreatedOwners()
  })

  test('an invalid zone name is refused on update and nothing changes', async () => {
    for (const bad of ['Mars/Olympus', 'Europe/Londn', '', 'UTC+2']) {
      const res = await owner.client
        .from('workspaces')
        .update({ time_zone: bad })
        .eq('id', data.workspaceId)
        .select('id')
      expect(res.error, `"${bad}" must be refused`).not.toBeNull()
      expect(res.error?.message, `"${bad}"`).toBe('invalid_time_zone')
    }
    const row = await owner.client.from('workspaces').select('time_zone').eq('id', data.workspaceId).single()
    expect(row.data?.time_zone).toBe('UTC')
  })

  test('an invalid zone name and a missing zone are refused on insert', async () => {
    const tag = randomBytes(4).toString('hex')
    // A second owner, so the Free workspace limit of the first one cannot be what refuses.
    const other = await createOwner()

    const bad = await other.client
      .from('workspaces')
      .insert({ owner_id: other.id, name: 'Bad zone', slug: `bz-${tag}`, time_zone: 'Mars/Olympus' })
    expect(bad.error?.message).toBe('invalid_time_zone')

    const missing = await other.client
      .from('workspaces')
      // time_zone left out on purpose: the database has no default (DB10).
      .insert({ owner_id: other.id, name: 'No zone', slug: `nz-${tag}` } as never)
    expect(missing.error, 'a missing zone must be refused, not defaulted').not.toBeNull()

    const stored = await service.from('workspaces').select('id').eq('owner_id', other.id)
    expect(stored.data, 'nothing was created').toEqual([])
  })

  test('changing the zone keeps the booking moment (starts_at and ends_at unchanged)', async () => {
    const startsAt = slotIso(data.day, 10)
    const bookingId = await bookAsServer(service, data.resourceId, startsAt)

    const before = await owner.client.from('bookings').select('starts_at, ends_at').eq('id', bookingId).single()
    expect(before.error).toBeNull()
    expect(new Date(before.data!.starts_at).toISOString()).toBe(startsAt)

    for (const zone of ['Asia/Tokyo', 'America/New_York', 'Pacific/Auckland']) {
      const change = await owner.client
        .from('workspaces')
        .update({ time_zone: zone })
        .eq('id', data.workspaceId)
        .select('time_zone')
        .single()
      expect(change.error, `change to ${zone}`).toBeNull()
      expect(change.data?.time_zone).toBe(zone)

      const after = await owner.client.from('bookings').select('starts_at, ends_at').eq('id', bookingId).single()
      expect(after.error).toBeNull()
      expect(after.data, `after changing to ${zone} the exact moments are the same`).toEqual(before.data)
    }
  })
})
