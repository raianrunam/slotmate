import { expect, test } from '@playwright/test'
import {
  bookingArgs,
  bookingCount,
  createBookableResource,
  createOwner,
  deleteCreatedOwners,
  serviceClient,
  slotIso,
  usageCount,
  type BookableResource,
  type Db,
  type TestOwner,
} from './helpers'

// T8 - Parallel booking. With service_role, fire submit_booking calls for the
// same resource and slot at the same instant; repeat 20 times (a different
// slot each round).
// Expected: exactly one booking each round; the losers get slot_taken; the
// owner's monthly count rose by exactly 1 per round. (PERF-03, AVAIL-04)

const ROUNDS = 20
const CALLS_PER_ROUND = 3

test.describe('T8 parallel booking of one slot', () => {
  test.setTimeout(240_000)

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

  test(`${ROUNDS} rounds of ${CALLS_PER_ROUND} simultaneous requests: one winner per round, usage +1 per round`, async () => {
    for (let round = 0; round < ROUNDS; round++) {
      const startsAt = slotIso(data.day, round) // 00:00, 01:00 ... 19:00 UTC
      const before = await usageCount(service, owner.id)

      // Every call gets its own status-token hash, like three different visitors.
      const results = await Promise.all(
        Array.from({ length: CALLS_PER_ROUND }, () =>
          service.rpc('submit_booking', bookingArgs(data.resourceId, startsAt)),
        ),
      )

      const winners = results.filter((r) => !r.error)
      const losers = results.filter((r) => r.error)

      expect(winners.length, `round ${round}: exactly one request must win`).toBe(1)
      expect(winners[0].data, `round ${round}: the winner gets one row back`).toHaveLength(1)
      for (const loser of losers) {
        expect(loser.error?.message, `round ${round}: every loser must get slot_taken`).toBe('slot_taken')
      }
      expect(losers.length, `round ${round}: the others were refused`).toBe(CALLS_PER_ROUND - 1)

      const after = await usageCount(service, owner.id)
      expect(after - before, `round ${round}: monthly count must rise by exactly 1`).toBe(1)
    }

    // End state: one booking per slot, usage equals the number of rounds.
    expect(await bookingCount(service, data.resourceId)).toBe(ROUNDS)
    expect(await usageCount(service, owner.id)).toBe(ROUNDS)

    const bookings = await service
      .from('bookings')
      .select('starts_at, ends_at, status')
      .eq('resource_id', data.resourceId)
      .order('starts_at')
    expect(bookings.data).toHaveLength(ROUNDS)
    expect(bookings.data?.every((b) => b.status === 'pending')).toBe(true)
    const starts = bookings.data?.map((b) => new Date(b.starts_at).toISOString())
    expect(new Set(starts).size).toBe(ROUNDS)
  })
})
