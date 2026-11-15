import { randomBytes } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { effectivePlan, PLAN_LIMITS } from '../../src/lib/plans'
import { createOwner, deleteCreatedOwners, serviceClient, type Db, type TestOwner } from './helpers'

// T18 - src/lib/plans.ts matches the database (DB6, Q12).
//  1. PLAN_LIMITS (shown in the app) equals the plan_limits table (enforced by
//     the triggers), for every plan and every number.
//  2. The app's Pro rule (effectivePlan) agrees with the database's
//     current_plan() for each subscription state.

test.describe('T18 plans.ts matches plan_limits and current_plan', () => {
  let service: Db
  let owner: TestOwner

  test.beforeAll(async () => {
    service = serviceClient()
    owner = await createOwner()
  })

  test.afterAll(async () => {
    await deleteCreatedOwners()
  })

  test('PLAN_LIMITS equals the plan_limits table exactly', async () => {
    const { data, error } = await service.from('plan_limits').select('plan, max_workspaces, max_resources, max_monthly_bookings')
    expect(error).toBeNull()
    expect(data?.map((r) => r.plan).sort(), 'the table has exactly the plans plans.ts has').toEqual(Object.keys(PLAN_LIMITS).sort())
    for (const row of data ?? []) {
      const mirror = PLAN_LIMITS[row.plan]
      expect(
        { maxWorkspaces: row.max_workspaces, maxResources: row.max_resources, maxMonthlyBookings: row.max_monthly_bookings },
        `limits of the ${row.plan} plan`,
      ).toEqual({ ...mirror })
    }
  })

  test('effectivePlan agrees with current_plan() for every subscription state', async () => {
    const states: { plan: 'free' | 'pro'; status: string | null }[] = [
      { plan: 'free', status: null },
      { plan: 'pro', status: 'active' },
      { plan: 'pro', status: 'trialing' },
      { plan: 'pro', status: 'past_due' },
      { plan: 'pro', status: 'canceled' },
      { plan: 'pro', status: 'incomplete' },
      { plan: 'free', status: 'canceled' },
    ]
    for (const state of states) {
      const update = await service
        .from('subscriptions')
        .update({
          plan: state.plan,
          status: state.status,
          stripe_subscription_id: state.plan === 'pro' ? `sub_test_${randomBytes(8).toString('hex')}` : null,
        })
        .eq('owner_id', owner.id)
        .select('plan')
      expect(update.error, JSON.stringify(state)).toBeNull()
      const db = await service.rpc('current_plan', { p_owner_id: owner.id })
      expect(db.error).toBeNull()
      expect(effectivePlan(state), `app vs database for ${JSON.stringify(state)}`).toBe(db.data)
    }
  })
})
