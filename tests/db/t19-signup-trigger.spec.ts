import { expect, test } from '@playwright/test'
import { createOwner, deleteCreatedOwners, deleteOwner, serviceClient } from './helpers'

// T19 - Sign-up trigger. Create an account through Auth.
// Expected: a profiles row and a Free subscriptions row exist - exactly one of
// each. (AUTH-01; a failing trigger on auth.users would block ALL sign-ups,
// DATABASE.md section 13.)
// Extra: deleting the Auth user removes both rows (ON DELETE CASCADE).

test.afterAll(async () => {
  await deleteCreatedOwners()
})

test('T19 creating a user creates exactly one profile and one free subscription', async () => {
  const service = serviceClient()
  const owner = await createOwner() // auth.admin.createUser fires on_auth_user_created

  // As the new owner (real login): exactly their own profile row.
  const profiles = await owner.client.from('profiles').select('id, created_at')
  expect(profiles.error).toBeNull()
  expect(profiles.data).toHaveLength(1)
  expect(profiles.data?.[0].id).toBe(owner.id)

  // As the new owner: exactly one subscription row, free, nothing from Stripe yet.
  const own = await owner.client
    .from('subscriptions')
    .select('owner_id, plan, status, stripe_customer_id, stripe_subscription_id, current_period_end, cancel_at_period_end')
  expect(own.error).toBeNull()
  expect(own.data).toEqual([
    {
      owner_id: owner.id,
      plan: 'free',
      status: null,
      stripe_customer_id: null,
      stripe_subscription_id: null,
      current_period_end: null,
      cancel_at_period_end: false,
    },
  ])

  // As our server: still exactly one subscription row for that owner.
  const server = await service.from('subscriptions').select('owner_id').eq('owner_id', owner.id)
  expect(server.data).toHaveLength(1)

  // Deleting the Auth user cascades: profile and subscription are gone.
  await deleteOwner(owner.id)
  const afterDelete = await service.from('subscriptions').select('owner_id').eq('owner_id', owner.id)
  expect(afterDelete.error).toBeNull()
  expect(afterDelete.data).toEqual([])
})
