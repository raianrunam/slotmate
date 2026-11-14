import { expect, test } from '@playwright/test'
import {
  anonClient,
  bookAsServer,
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

// T2 - Public key only: submit_booking. Call rpc/submit_booking with just the
// public key (anon). Repeat as a logged-in owner.
// Expected: both fail with a permission error; no booking is created and no
// usage is counted. (DATABASE.md section 6, ISO-02)

test.describe('T2 submit_booking is closed to browser roles', () => {
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

  test('anon and a logged-in owner are refused; nothing is created or counted', async () => {
    const args = bookingArgs(data.resourceId, slotIso(data.day, 10))

    const asAnon = await anonClient().rpc('submit_booking', args)
    expect(asAnon.error, 'anon call must be refused').not.toBeNull()
    expect(asAnon.data).toBeNull()
    // 42501 = permission denied for function; PGRST202 = the function is not
    // even visible to that role. Both mean "this role cannot call it".
    expect(['42501', 'PGRST202']).toContain(asAnon.error?.code)

    const asOwner = await owner.client.rpc('submit_booking', args)
    expect(asOwner.error, 'owner call must be refused').not.toBeNull()
    expect(asOwner.data).toBeNull()
    expect(['42501', 'PGRST202']).toContain(asOwner.error?.code)

    expect(await bookingCount(service, data.resourceId)).toBe(0)
    expect(await usageCount(service, owner.id)).toBe(0)
  })

  test('positive control: the same arguments work for our server (service_role)', async () => {
    // Proves the arguments above were valid, so the refusals were about permission.
    const bookingId = await bookAsServer(service, data.resourceId, slotIso(data.day, 10))
    expect(bookingId).toMatch(/^[0-9a-f-]{36}$/)
    expect(await bookingCount(service, data.resourceId)).toBe(1)
    expect(await usageCount(service, owner.id)).toBe(1)
  })
})
