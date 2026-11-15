import { randomBytes } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { createOwner, deleteCreatedOwners, expectNoEffect, serviceClient, type Db, type TestOwner } from './helpers'

// T16 part 1 - Locking workspaces on downgrade (D20, A18, DATABASE.md 7.8).
// The plan changes the same way the Stripe webhook changes it: service_role
// UPDATE on subscriptions (with a stripe_subscription_id for Pro).
//   Pro -> create 2 workspaces -> back to Free: BOTH locked (safe state, no
//   automatic choice). Owner UPDATE on a locked workspace has no effect. Owner
//   DELETE of one -> reconcile unlocks the rest (within the Free limit again).
// Part 2 (resources, apply_downgrade_selection) is still planned.

test.describe('T16 part 1: lock and unlock workspaces', () => {
  let owner: TestOwner
  let service: Db

  test.beforeAll(async () => {
    service = serviceClient()
    owner = await createOwner()
  })

  test.afterAll(async () => {
    await deleteCreatedOwners()
  })

  async function setPlan(plan: 'pro' | 'free') {
    const changes =
      plan === 'pro'
        ? { plan: 'pro' as const, status: 'active', stripe_subscription_id: `sub_test_${randomBytes(8).toString('hex')}` }
        : { plan: 'free' as const, status: 'canceled', stripe_subscription_id: null }
    const res = await service.from('subscriptions').update(changes).eq('owner_id', owner.id).select('plan')
    expect(res.error, `set plan ${plan}`).toBeNull()
    expect(res.data).toHaveLength(1)
  }

  async function lockStates() {
    const { data, error } = await owner.client.from('workspaces').select('id, name, is_locked').order('name')
    expect(error).toBeNull()
    return data ?? []
  }

  test('downgrade locks everything, locked rows are read-only, a delete unlocks the rest', async () => {
    const tag = randomBytes(4).toString('hex')

    await setPlan('pro')
    const ids: string[] = []
    for (const n of [1, 2]) {
      const res = await owner.client
        .from('workspaces')
        .insert({ owner_id: owner.id, name: `Lock ${n}`, slug: `lock-${tag}-${n}`, time_zone: 'UTC' })
        .select('id')
        .single()
      expect(res.error, `create workspace ${n} as Pro`).toBeNull()
      ids.push(res.data!.id)
    }
    expect((await lockStates()).map((w) => w.is_locked), 'nothing is locked while Pro').toEqual([false, false])

    await setPlan('free')
    const locked = await lockStates()
    expect(locked, 'both workspaces still exist (nothing is deleted)').toHaveLength(2)
    expect(locked.map((w) => w.is_locked), 'over the Free limit with no selection: all locked').toEqual([true, true])

    // The owner cannot change a locked workspace (RLS: the row is not updatable).
    const update = await owner.client.from('workspaces').update({ name: 'Renamed' }).eq('id', ids[0]).select('id')
    expectNoEffect(update, 'owner UPDATE on a locked workspace')
    const unchanged = await owner.client.from('workspaces').select('name').eq('id', ids[0]).single()
    expect(unchanged.data?.name).toBe('Lock 1')

    // ...but may delete it, which is the way back within the limit.
    const del = await owner.client.from('workspaces').delete().eq('id', ids[0]).select('id')
    expect(del.error).toBeNull()
    expect(del.data, 'the delete removed exactly one row').toHaveLength(1)

    const rest = await lockStates()
    expect(rest).toHaveLength(1)
    expect(rest[0].is_locked, 'reconcile unlocked the remaining workspace').toBe(false)

    // And it is editable again.
    const edit = await owner.client.from('workspaces').update({ name: 'Renamed' }).eq('id', ids[1]).select('name').single()
    expect(edit.error).toBeNull()
    expect(edit.data?.name).toBe('Renamed')
  })
})
