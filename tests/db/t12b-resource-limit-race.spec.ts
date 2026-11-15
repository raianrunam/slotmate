import { randomBytes } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { createOwner, deleteCreatedOwners, serviceClient, type Db, type TestOwner } from './helpers'

// T12, resources part (BILL-07, DATABASE.md 7.7). One Free owner (limit: 3
// resources across the account) fires 10 resource creates at the same instant,
// each straight through the owner's own login (RLS), like 10 browser tabs.
// Expected: exactly 3 succeed; the other 7 get resource_limit_reached (after
// the one deadlock retry of Q10, if a deadlock happened); exactly 3 resources
// exist afterwards.

const PARALLEL = 10

test.describe('T12 resource limit race (Free owner)', () => {
  let owner: TestOwner
  let service: Db
  let workspaceId: string

  test.beforeAll(async () => {
    service = serviceClient()
    owner = await createOwner()
    const ws = await owner.client
      .from('workspaces')
      .insert({ owner_id: owner.id, name: 'Race ws', slug: `rr-${randomBytes(4).toString('hex')}`, time_zone: 'UTC' })
      .select('id')
      .single()
    expect(ws.error).toBeNull()
    workspaceId = ws.data!.id
  })

  test.afterAll(async () => {
    await deleteCreatedOwners()
  })

  test(`${PARALLEL} parallel creates: exactly 3 succeed, the rest get resource_limit_reached`, async () => {
    const create = async (n: number) => {
      const insert = () =>
        owner.client
          .from('resources')
          .insert({ workspace_id: workspaceId, owner_id: owner.id, name: `Race ${n}`, slot_minutes: 30, capacity: 2 })
      const first = await insert()
      return first.error?.code === '40P01' ? await insert() : first
    }

    const results = await Promise.all(Array.from({ length: PARALLEL }, (_, n) => create(n)))

    expect(results.filter((r) => !r.error), 'exactly three creates succeed (Free limit)').toHaveLength(3)
    const losers = results.filter((r) => r.error)
    expect(losers).toHaveLength(PARALLEL - 3)
    for (const loser of losers) {
      expect(loser.error?.message, 'every loser is refused by the plan-limit trigger').toBe('resource_limit_reached')
    }

    const stored = await service.from('resources').select('id').eq('owner_id', owner.id)
    expect(stored.error).toBeNull()
    expect(stored.data, 'exactly three resources exist afterwards').toHaveLength(3)
  })
})
