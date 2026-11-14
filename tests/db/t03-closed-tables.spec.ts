import { expect, test } from '@playwright/test'
import {
  anonClient,
  createOwner,
  deleteCreatedOwners,
  expectClosed,
  type TestOwner,
} from './helpers'

// T3 - Public key only: closed tables. With the public key, select from
// rate_limit_attempts, stripe_events and subscriptions. Repeat as a logged-in
// owner for rate_limit_attempts and stripe_events.
// Expected: permission denied (or no rows). (DATABASE.md section 6.3)

test.describe('T3 closed tables', () => {
  let owner: TestOwner

  test.beforeAll(async () => {
    owner = await createOwner() // creates a profile + subscription row to be "protected"
  })

  test.afterAll(async () => {
    await deleteCreatedOwners()
  })

  test('anon cannot read rate_limit_attempts, stripe_events or subscriptions', async () => {
    const anon = anonClient()
    expectClosed(await anon.from('rate_limit_attempts').select('id'), 'anon rate_limit_attempts')
    expectClosed(await anon.from('stripe_events').select('event_id'), 'anon stripe_events')
    expectClosed(await anon.from('subscriptions').select('owner_id'), 'anon subscriptions')
  })

  test('a logged-in owner cannot read rate_limit_attempts or stripe_events', async () => {
    expectClosed(
      await owner.client.from('rate_limit_attempts').select('id'),
      'owner rate_limit_attempts',
    )
    expectClosed(await owner.client.from('stripe_events').select('event_id'), 'owner stripe_events')
  })

  test('positive control: the owner CAN read their own subscription, anon cannot', async () => {
    const own = await owner.client.from('subscriptions').select('owner_id, plan')
    expect(own.error).toBeNull()
    expect(own.data).toEqual([{ owner_id: owner.id, plan: 'free' }])
  })
})
