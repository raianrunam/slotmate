import { randomBytes, randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { createOwner, deleteCreatedOwners, serviceClient, type Db, type TestOwner } from './helpers'

// T16 part 2 - the downgrade selection (A18, S2, DB17, DATABASE.md 7.8).
// Real paths: the server key calls apply_downgrade_selection (the only way to unlock a subset);
// the owner is really logged in and reads the lock flags with RLS applying.
//   Pro owner: W1 with 4 resources, W2 with 1 resource. Pro ends -> EVERYTHING locked, nothing chosen.
//   Refused (and nothing changes): resource from another workspace (DB17), four resources, repeated resource,
//   another owner's workspace, a workspace that does not exist, an empty (NULL) workspace choice,
//   and a call when the owner is within the limits (selection_not_needed).
//   Accepted: W1 + 2 of its resources -> exactly those are unlocked. Upgrading again unlocks all.

test.describe('T16 part 2: downgrade selection', () => {
  let owner: TestOwner
  let other: TestOwner
  let service: Db
  const tag = randomBytes(4).toString('hex')
  let w1 = ''
  let w2 = ''
  let r1: string[] = []
  let r2 = ''

  test.beforeAll(async () => {
    service = serviceClient()
    owner = await createOwner()
    other = await createOwner()
  })
  test.afterAll(async () => {
    await deleteCreatedOwners()
  })

  async function setPlan(ownerId: string, plan: 'pro' | 'free') {
    const changes =
      plan === 'pro'
        ? { plan: 'pro' as const, status: 'active', stripe_subscription_id: `sub_test_${randomBytes(8).toString('hex')}` }
        : { plan: 'free' as const, status: 'canceled', stripe_subscription_id: null }
    const res = await service.from('subscriptions').update(changes).eq('owner_id', ownerId).select('plan')
    expect(res.error, `set plan ${plan}`).toBeNull()
  }

  async function workspace(o: TestOwner, name: string) {
    const res = await o.client
      .from('workspaces')
      .insert({ owner_id: o.id, name, slug: `sel-${tag}-${name}`, time_zone: 'UTC' })
      .select('id')
      .single()
    expect(res.error, `create workspace ${name}`).toBeNull()
    return res.data!.id
  }
  async function resource(o: TestOwner, workspaceId: string, name: string) {
    const res = await o.client
      .from('resources')
      .insert({ owner_id: o.id, workspace_id: workspaceId, name, slot_minutes: 30, capacity: 1 })
      .select('id')
      .single()
    expect(res.error, `create resource ${name}`).toBeNull()
    return res.data!.id
  }

  async function unlocked() {
    const [w, r] = await Promise.all([
      owner.client.from('workspaces').select('id, is_locked'),
      owner.client.from('resources').select('id, is_locked'),
    ])
    expect(w.error).toBeNull()
    expect(r.error).toBeNull()
    return {
      workspaces: (w.data ?? []).filter((x) => !x.is_locked).map((x) => x.id).sort(),
      resources: (r.data ?? []).filter((x) => !x.is_locked).map((x) => x.id).sort(),
    }
  }

  const apply = (workspaceId: string | null, resourceIds: string[] | null, ownerId = owner.id) =>
    service.rpc('apply_downgrade_selection', {
      p_owner_id: ownerId,
      p_workspace_id: workspaceId as string,
      p_resource_ids: resourceIds as string[],
    })

  test('Pro ends: everything is locked, bad selections are refused, a valid one unlocks exactly those', async () => {
    await setPlan(owner.id, 'pro')
    w1 = await workspace(owner, 'a')
    w2 = await workspace(owner, 'b')
    r1 = []
    for (const n of [1, 2, 3, 4]) r1.push(await resource(owner, w1, `r${n}`))
    r2 = await resource(owner, w2, 'x')
    expect(await unlocked(), 'Pro: nothing locked').toMatchObject({ workspaces: [w1, w2].sort() })

    await setPlan(owner.id, 'free')
    expect(await unlocked(), 'no automatic choice: everything is locked').toEqual({ workspaces: [], resources: [] })

    const otherWorkspace = await workspace(other, 'o')
    // Lazy, so each case runs alone and "nothing changed" is attributable to that case.
    const refusals: [string, () => PromiseLike<{ error: { message: string } | null }>][] = [
      ['resource from another workspace (DB17)', () => apply(w1, [r1[0], r2])],
      ['four resources', () => apply(w1, r1)],
      ['the same resource twice', () => apply(w1, [r1[0], r1[0]])],
      ['another owner workspace', () => apply(otherWorkspace, [])],
      ['a workspace that does not exist', () => apply(randomUUID(), [])],
      ['an empty (NULL) workspace choice', () => apply(null, [])],
      ['a resource that does not exist', () => apply(w1, [randomUUID()])],
    ]
    for (const [label, call] of refusals) {
      const res = await call()
      expect(res.error, `${label}: refused`).not.toBeNull()
      expect(res.error!.message, label).toMatch(/invalid_selection/)
      expect(await unlocked(), `${label}: nothing changed`).toEqual({ workspaces: [], resources: [] })
    }

    // The owner's own session cannot call it at all (server-only function).
    const direct = await owner.client.rpc('apply_downgrade_selection', {
      p_owner_id: owner.id,
      p_workspace_id: w1,
      p_resource_ids: [r1[0]],
    })
    expect(direct.error?.code, 'owner cannot call the function').toBe('42501')
    expect(await unlocked()).toEqual({ workspaces: [], resources: [] })

    // A valid choice: W1 and two of its resources.
    const ok = await apply(w1, [r1[0], r1[2]])
    expect(ok.error, 'valid selection').toBeNull()
    expect(await unlocked(), 'exactly the selection is unlocked').toEqual({
      workspaces: [w1],
      resources: [r1[0], r1[2]].sort(),
    })

    // Upgrading again unlocks everything (never a subset by itself).
    await setPlan(owner.id, 'pro')
    expect((await unlocked()).workspaces).toEqual([w1, w2].sort())
    expect((await unlocked()).resources).toHaveLength(5)
  })

  test('within the limits there is nothing to select (selection_not_needed)', async () => {
    const own = await workspace(other, 'solo').catch(async () => (await other.client.from('workspaces').select('id').limit(1).single()).data!.id)
    const res = await apply(own, [], other.id)
    expect(res.error).not.toBeNull()
    expect(res.error!.message).toMatch(/selection_not_needed/)
    const rows = await other.client.from('workspaces').select('is_locked')
    expect((rows.data ?? []).every((w) => !w.is_locked)).toBe(true)
  })

  test('webhook memory (T15): claimed, duplicate after marking, claimed again if the first try never finished', async () => {
    const id = `evt_test_${randomBytes(8).toString('hex')}`
    const first = await service.rpc('claim_stripe_event', { p_event_id: id, p_event_type: 'customer.subscription.updated' })
    expect(first.data).toBe('claimed')
    // Crashed before marking: a retry may finish the job.
    const retry = await service.rpc('claim_stripe_event', { p_event_id: id, p_event_type: 'customer.subscription.updated' })
    expect(retry.data).toBe('claimed')
    expect((await service.rpc('mark_stripe_event_processed', { p_event_id: id })).error).toBeNull()
    const again = await service.rpc('claim_stripe_event', { p_event_id: id, p_event_type: 'customer.subscription.updated' })
    expect(again.data, 'handled message: nothing to do').toBe('duplicate')
    // Not callable with the public key or by a logged-in owner.
    expect((await owner.client.rpc('claim_stripe_event', { p_event_id: id, p_event_type: 'x' })).error?.code).toBe('42501')
  })
})
