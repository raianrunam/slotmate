import { expect, test } from '@playwright/test'
import {
  createOwner,
  deleteCreatedOwners,
  expectPermissionDenied,
  serviceClient,
  type Db,
  type TestOwner,
} from './helpers'

// T5 - Owner cannot write the subscription. As owner A, try to set own plan to
// pro, change status, insert a second row, delete the row.
// Expected: all fail; the plan stays free. (BILL-06, A6)

test.describe('T5 owners cannot write their subscription', () => {
  let service: Db
  let owner: TestOwner

  test.beforeAll(async () => {
    service = serviceClient()
    owner = await createOwner()
  })

  test.afterAll(async () => {
    await deleteCreatedOwners()
  })

  test('every write by the owner is refused and the plan stays free', async () => {
    const subscriptions = owner.client.from('subscriptions')

    expectPermissionDenied(
      await subscriptions.update({ plan: 'pro' }).eq('owner_id', owner.id),
      'set plan to pro',
    )
    expectPermissionDenied(
      await subscriptions.update({ status: 'active' }).eq('owner_id', owner.id),
      'set status to active',
    )
    expectPermissionDenied(
      await subscriptions
        .update({ stripe_subscription_id: 'sub_fake', plan: 'pro' })
        .eq('owner_id', owner.id),
      'set a fake Stripe subscription and plan',
    )
    expectPermissionDenied(
      await subscriptions.update({ cancel_at_period_end: true }).eq('owner_id', owner.id),
      'set cancel_at_period_end',
    )
    expectPermissionDenied(
      await subscriptions.insert({ owner_id: owner.id, plan: 'free' }),
      'insert a second row (free)',
    )
    expectPermissionDenied(
      await subscriptions.insert({ owner_id: owner.id, plan: 'pro', stripe_subscription_id: 'sub_fake' }),
      'insert a second row (pro)',
    )
    expectPermissionDenied(
      await subscriptions.delete().eq('owner_id', owner.id),
      'delete the row',
    )

    // Still exactly one row, still free, nothing from Stripe.
    const rows = await service
      .from('subscriptions')
      .select('owner_id, plan, status, stripe_customer_id, stripe_subscription_id, cancel_at_period_end')
      .eq('owner_id', owner.id)
    expect(rows.data).toEqual([
      {
        owner_id: owner.id,
        plan: 'free',
        status: null,
        stripe_customer_id: null,
        stripe_subscription_id: null,
        cancel_at_period_end: false,
      },
    ])

    // The owner still sees their own row through RLS.
    const own = await owner.client.from('subscriptions').select('plan')
    expect(own.data).toEqual([{ plan: 'free' }])
  })
})
