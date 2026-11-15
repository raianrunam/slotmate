import { randomBytes } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { createOwner, deleteCreatedOwners, serviceClient, type Db, type TestOwner } from './helpers'

// T12 - Plan-limit race (BILL-07, DATABASE.md 7.7). One Free owner (limit: 1
// workspace) fires 10 workspace creates at the same instant, each through the
// owner's own login (RLS), like 10 browser tabs.
// Expected: exactly one succeeds; the other nine get workspace_limit_reached
// (after the one deadlock retry of Q10, if a deadlock happened); exactly one
// workspace exists afterwards.

const PARALLEL = 10

test.describe('T12 workspace limit race (Free owner)', () => {
  let owner: TestOwner
  let service: Db

  test.beforeAll(async () => {
    service = serviceClient()
    owner = await createOwner()
  })

  test.afterAll(async () => {
    await deleteCreatedOwners()
  })

  test(`${PARALLEL} parallel creates: exactly 1 succeeds, the rest get workspace_limit_reached`, async () => {
    const tag = randomBytes(4).toString('hex')
    const create = async (n: number) => {
      const insert = () =>
        owner.client
          .from('workspaces')
          .insert({ owner_id: owner.id, name: `Race ${n}`, slug: `race-${tag}-${n}`, time_zone: 'UTC' })
      // Q10: a write retries once when the database cancels it for a deadlock.
      const first = await insert()
      return first.error?.code === '40P01' ? await insert() : first
    }

    const results = await Promise.all(Array.from({ length: PARALLEL }, (_, n) => create(n)))

    const winners = results.filter((r) => !r.error)
    const losers = results.filter((r) => r.error)
    expect(winners, 'exactly one create must succeed').toHaveLength(1)
    expect(losers).toHaveLength(PARALLEL - 1)
    for (const loser of losers) {
      expect(loser.error?.message, 'every loser is refused by the plan-limit trigger').toBe(
        'workspace_limit_reached',
      )
    }

    const stored = await service.from('workspaces').select('id').eq('owner_id', owner.id)
    expect(stored.error).toBeNull()
    expect(stored.data, 'exactly one workspace exists afterwards').toHaveLength(1)
  })
})
