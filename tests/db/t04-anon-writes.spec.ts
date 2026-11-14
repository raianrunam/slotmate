import { expect, test } from '@playwright/test'
import {
  anonClient,
  bookAsServer,
  bookingCount,
  createBookableResource,
  createOwner,
  deleteCreatedOwners,
  expectPermissionDenied,
  serviceClient,
  slotIso,
  usageCount,
  type BookableResource,
  type Db,
  type TestOwner,
} from './helpers'

// T4 - Public key only: writes. With the public key, insert, update and delete
// on subscriptions, rate_limit_attempts, stripe_events, monthly_usage and
// bookings.
// Expected: every write fails; row counts and values unchanged.
// (DATABASE.md sections 5 and 6)
//
// Note on rate_limit_attempts and stripe_events: our server (service_role) has
// no privilege on these two tables either (section 6.3), so their row counts
// cannot be read through a real path. Each refused statement is a statement
// that did not run, so "refused" is the proof for those two.

test.describe('T4 anon cannot write', () => {
  let service: Db
  let owner: TestOwner
  let data: BookableResource
  let bookingId: string

  test.beforeAll(async () => {
    service = serviceClient()
    owner = await createOwner()
    data = await createBookableResource(owner)
    bookingId = await bookAsServer(service, data.resourceId, slotIso(data.day, 10))
  })

  test.afterAll(async () => {
    await deleteCreatedOwners()
  })

  test('every insert, update and delete as anon is refused', async () => {
    const anon = anonClient()
    const zeroHash = `\\x${'00'.repeat(32)}`

    // subscriptions
    expectPermissionDenied(
      await anon.from('subscriptions').insert({ owner_id: owner.id, plan: 'free' }),
      'anon insert subscriptions',
    )
    expectPermissionDenied(
      await anon.from('subscriptions').update({ plan: 'pro' }).eq('owner_id', owner.id),
      'anon update subscriptions',
    )
    expectPermissionDenied(
      await anon.from('subscriptions').delete().eq('owner_id', owner.id),
      'anon delete subscriptions',
    )

    // rate_limit_attempts
    expectPermissionDenied(
      await anon.from('rate_limit_attempts').insert({ workspace_id: data.workspaceId, ip_hash: zeroHash }),
      'anon insert rate_limit_attempts',
    )
    expectPermissionDenied(
      await anon.from('rate_limit_attempts').update({ ip_hash: zeroHash }).eq('workspace_id', data.workspaceId),
      'anon update rate_limit_attempts',
    )
    expectPermissionDenied(
      await anon.from('rate_limit_attempts').delete().eq('workspace_id', data.workspaceId),
      'anon delete rate_limit_attempts',
    )

    // stripe_events
    expectPermissionDenied(
      await anon.from('stripe_events').insert({ event_id: 'evt_test_anon', event_type: 'test' }),
      'anon insert stripe_events',
    )
    expectPermissionDenied(
      await anon.from('stripe_events').update({ event_type: 'x' }).eq('event_id', 'evt_test_anon'),
      'anon update stripe_events',
    )
    expectPermissionDenied(
      await anon.from('stripe_events').delete().eq('event_id', 'evt_test_anon'),
      'anon delete stripe_events',
    )

    // monthly_usage
    expectPermissionDenied(
      await anon.from('monthly_usage').insert({ owner_id: owner.id, month: '2020-01-01', booking_count: 999 }),
      'anon insert monthly_usage',
    )
    expectPermissionDenied(
      await anon.from('monthly_usage').update({ booking_count: 0 }).eq('owner_id', owner.id),
      'anon update monthly_usage',
    )
    expectPermissionDenied(
      await anon.from('monthly_usage').delete().eq('owner_id', owner.id),
      'anon delete monthly_usage',
    )

    // bookings
    expectPermissionDenied(
      await anon.from('bookings').insert({
        resource_id: data.resourceId,
        owner_id: owner.id,
        visitor_name: 'x',
        visitor_email: 'x@example.com',
        attendees: 1,
        starts_at: slotIso(data.day, 15),
        ends_at: slotIso(data.day, 16),
        status_token_hash: zeroHash,
      }),
      'anon insert bookings',
    )
    expectPermissionDenied(
      await anon.from('bookings').update({ status: 'approved' }).eq('id', bookingId),
      'anon update bookings',
    )
    expectPermissionDenied(
      await anon.from('bookings').delete().eq('id', bookingId),
      'anon delete bookings',
    )
  })

  test('row counts and values are unchanged', async () => {
    const subscription = await service
      .from('subscriptions')
      .select('plan, status, stripe_subscription_id')
      .eq('owner_id', owner.id)
    expect(subscription.data).toEqual([{ plan: 'free', status: null, stripe_subscription_id: null }])

    expect(await bookingCount(service, data.resourceId)).toBe(1)
    const booking = await service.from('bookings').select('status').eq('id', bookingId).single()
    expect(booking.data?.status).toBe('pending')

    // Exactly the one booking made by our server, and nothing from the fake 2020 row.
    expect(await usageCount(service, owner.id)).toBe(1)
  })
})
