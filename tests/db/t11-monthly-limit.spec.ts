import { expect, test } from '@playwright/test'
import {
  bookingArgs,
  bookingCount,
  createBookableResource,
  createOwner,
  deleteCreatedOwners,
  futureDay,
  serviceClient,
  slotIso,
  usageCount,
  type BookableResource,
  type Db,
  type TestOwner,
} from './helpers'

// T11 - The monthly booking limit (BILL-07, D19, A7, DATABASE.md 7.3), through real paths.
// A Free owner (100 requests a month) gets 100 REAL submissions through submit_booking, as
// our server makes them. The 101st is refused with limit_reached. Deleting bookings (as the
// really logged-in owner) does not lower the count, so the 102nd is refused too. Upgrading to
// Pro raises the limit at once. A refused request saves nothing and uses no allowance.

const LIMIT = 100
const BATCH = 10

test.describe('T11 monthly limit (Free owner)', () => {
  test.setTimeout(300_000)

  let service: Db
  let owner: TestOwner
  let data: BookableResource

  test.beforeAll(async () => {
    service = serviceClient()
    owner = await createOwner()
    data = await createBookableResource(owner)
  })

  test.afterAll(async () => {
    await deleteCreatedOwners()
  })

  /** The n-th distinct whole-hour slot: 24 per day, from 2 days ahead. */
  const slot = (n: number) => slotIso(futureDay(2 + Math.floor(n / 24)), n % 24)
  const submit = (startsAt: string) => service.rpc('submit_booking', bookingArgs(data.resourceId, startsAt))

  test('100 submissions succeed, the 101st gets limit_reached, deleting bookings does not lower the count, upgrading raises the limit', async () => {
    for (let i = 0; i < LIMIT; i += BATCH) {
      const results = await Promise.all(
        Array.from({ length: BATCH }, (_, k) => submit(slot(i + k))),
      )
      for (const [k, r] of results.entries()) {
        expect(r.error, `submission ${i + k + 1} is under the limit`).toBeNull()
      }
    }
    expect(await usageCount(service, owner.id)).toBe(LIMIT)
    expect(await bookingCount(service, data.resourceId)).toBe(LIMIT)

    // The 101st: refused, nothing saved, no allowance used.
    const over = await submit(slot(LIMIT))
    expect(over.error?.message).toBe('limit_reached')
    expect(await usageCount(service, owner.id), 'a refused request does not count').toBe(LIMIT)
    expect(await bookingCount(service, data.resourceId), 'a refused request saves nothing').toBe(LIMIT)

    // D19: deleting bookings does not lower the count. The owner deletes 10 as a real logged-in owner.
    const doomed = await service.from('bookings').select('id').eq('resource_id', data.resourceId).limit(10)
    expect(doomed.data).toHaveLength(10)
    const deleted = await owner.client.from('bookings').delete().in('id', doomed.data!.map((b) => b.id)).select('id')
    expect(deleted.error).toBeNull()
    expect(deleted.data).toHaveLength(10)
    expect(await bookingCount(service, data.resourceId)).toBe(LIMIT - 10)
    expect(await usageCount(service, owner.id), 'deleting does not lower the monthly count (D19)').toBe(LIMIT)
    expect((await submit(slot(LIMIT + 1))).error?.message, 'still at the limit after deleting').toBe('limit_reached')

    // The limit comes from the plan at that moment: upgrading to Pro allows requests at once (A7).
    const pro = await service
      .from('subscriptions')
      .update({ plan: 'pro', status: 'active', stripe_subscription_id: `sub_test_t11_${Date.now()}` })
      .eq('owner_id', owner.id)
      .select('plan')
    expect(pro.error).toBeNull()
    expect((await submit(slot(LIMIT + 2))).error, 'Pro allows more').toBeNull()
    expect(await usageCount(service, owner.id)).toBe(LIMIT + 1)
  })

  test('simultaneous requests for the last places: never more than the limit', async () => {
    // A second Free owner with 98 requests used (through real submissions), then 6 requests at once
    // for the last 2 places: exactly 2 succeed, 4 get limit_reached.
    const owner2 = await createOwner()
    const data2 = await createBookableResource(owner2)
    const submit2 = (startsAt: string) => service.rpc('submit_booking', bookingArgs(data2.resourceId, startsAt))
    const slot2 = (n: number) => slotIso(futureDay(2 + Math.floor(n / 24)), n % 24)

    for (let i = 0; i < 98; i += BATCH) {
      const results = await Promise.all(
        Array.from({ length: Math.min(BATCH, 98 - i) }, (_, k) => submit2(slot2(i + k))),
      )
      for (const r of results) expect(r.error).toBeNull()
    }
    expect(await usageCount(service, owner2.id)).toBe(98)

    const results = await Promise.all(Array.from({ length: 6 }, (_, k) => submit2(slot2(98 + k))))
    const ok = results.filter((r) => !r.error)
    const refused = results.filter((r) => r.error)
    expect(ok, 'exactly the 2 remaining places are given out').toHaveLength(2)
    for (const r of refused) expect(r.error?.message).toBe('limit_reached')
    expect(await usageCount(service, owner2.id)).toBe(100)
  })
})
