import { randomBytes } from 'node:crypto'
import { expect, test } from '@playwright/test'
import {
  anonClient,
  createBookableResource,
  createOwner,
  deleteCreatedOwners,
  serviceClient,
  usageCount,
  type BookableResource,
  type Db,
  type TestOwner,
} from './helpers'

// T14 - The public form's rate limit (SEC-06, D24, A9, DATABASE.md 7.4), through the real
// function check_rate_limit called by our server (service_role): at most 5 attempts per
// 10 minutes per visitor (ip_hash) per workspace. The 6th is refused; refused attempts count
// too; another workspace and another visitor are unaffected; and the function never touches
// the owner's monthly count.
//
// Not testable through real paths: the 10-minute window ending (the attempt times cannot be
// changed without a privilege no role has; the clean-up inside the function is checked by
// reading the table, which no role may do). TESTING.md lists this as an open item.

const hash = () => `\\x${randomBytes(32).toString('hex')}` // what the server sends: an HMAC, 32 bytes

test.describe('T14 rate limit', () => {
  let service: Db
  let ownerA: TestOwner
  let ownerB: TestOwner
  let a: BookableResource
  let b: BookableResource

  test.beforeAll(async () => {
    service = serviceClient()
    ownerA = await createOwner()
    ownerB = await createOwner()
    a = await createBookableResource(ownerA)
    b = await createBookableResource(ownerB)
  })

  test.afterAll(async () => {
    await deleteCreatedOwners()
  })

  const attempt = async (workspaceId: string, ipHash: string) => {
    const r = await service.rpc('check_rate_limit', { p_workspace_id: workspaceId, p_ip_hash: ipHash })
    expect(r.error, 'the check itself works').toBeNull()
    return r.data
  }

  test('5 attempts are allowed, the 6th and every later one is refused (refused attempts count)', async () => {
    const ip = hash()
    for (let n = 1; n <= 5; n++) {
      expect(await attempt(a.workspaceId, ip), `attempt ${n} is allowed`).toBe(true)
    }
    expect(await attempt(a.workspaceId, ip), 'attempt 6 is refused').toBe(false)
    expect(await attempt(a.workspaceId, ip), 'attempt 7 is refused too: refused attempts count').toBe(false)
    expect(await attempt(a.workspaceId, ip), 'and so on').toBe(false)
  })

  test('another workspace is unaffected, another visitor in the same workspace is unaffected', async () => {
    const ip = hash()
    for (let n = 0; n < 6; n++) await attempt(a.workspaceId, ip)
    expect(await attempt(a.workspaceId, ip), 'exhausted in workspace A').toBe(false)

    // Same visitor, other workspace: its own allowance of 5 (A9c).
    for (let n = 1; n <= 5; n++) {
      expect(await attempt(b.workspaceId, ip), `workspace B, attempt ${n}`).toBe(true)
    }
    expect(await attempt(b.workspaceId, ip), 'workspace B, attempt 6').toBe(false)

    // Another visitor (a different hash) in the exhausted workspace: unaffected.
    const other = hash()
    for (let n = 1; n <= 5; n++) {
      expect(await attempt(a.workspaceId, other), `other visitor, attempt ${n}`).toBe(true)
    }
    expect(await attempt(a.workspaceId, other)).toBe(false)
  })

  test('simultaneous attempts: never more than 5 are allowed', async () => {
    // KNOWN DATABASE WEAKNESS (found in Phase 11, reported to the owner; fixing it needs a NEW migration,
    // which is not authorised yet). check_rate_limit counts only COMMITTED attempts, and simultaneous calls
    // cannot see each other's uncommitted rows, so a parallel burst can be allowed in full: the first run
    // allowed 9 of 10, a later run allowed no more than 5. It depends on timing, so the test is SKIPPED
    // (an expected-failure mark would flip between pass and fail). DATABASE.md 7.4 said both would be
    // refused, which is wrong. A likely fix: an advisory lock on (workspace, ip_hash) at the start of the
    // function. Remove the skip when that migration exists.
    test.fixme(true, 'known weakness: parallel bursts can bypass the per-visitor limit (needs a new migration)')
    const ip = hash()
    const results = await Promise.all(Array.from({ length: 10 }, () => service.rpc('check_rate_limit', { p_workspace_id: a.workspaceId, p_ip_hash: ip })))
    for (const r of results) expect(r.error).toBeNull()
    const allowed = results.filter((r) => r.data === true).length
    // At the exact boundary, two simultaneous attempts may each see the other's record and both be
    // refused (DATABASE.md 7.4): that errs on the safe side. It must never allow MORE than 5.
    expect(allowed).toBeLessThanOrEqual(5)
    expect(allowed).toBeGreaterThanOrEqual(1)
    expect(await attempt(a.workspaceId, ip), 'afterwards the visitor is refused').toBe(false)
  })

  test('it never counts toward the owner monthly limit, and no booking is made', async () => {
    const before = await usageCount(service, ownerA.id)
    const ip = hash()
    for (let n = 0; n < 8; n++) await attempt(a.workspaceId, ip)
    expect(await usageCount(service, ownerA.id)).toBe(before)
  })

  test('only a 32-byte keyed hash is accepted: an IP address cannot be stored', async () => {
    for (const bad of ['203.0.113.9', '\\x' + randomBytes(31).toString('hex'), '\\x' + randomBytes(33).toString('hex'), '']) {
      const r = await service.rpc('check_rate_limit', { p_workspace_id: a.workspaceId, p_ip_hash: bad })
      expect(r.error, `"${bad.slice(0, 12)}" is refused`).not.toBeNull()
    }
  })

  test('visitors (no login) and owners cannot call it', async () => {
    const ip = hash()
    const anon = await anonClient().rpc('check_rate_limit', { p_workspace_id: a.workspaceId, p_ip_hash: ip })
    expect(anon.error?.code).toBe('42501')
    const owner = await ownerA.client.rpc('check_rate_limit', { p_workspace_id: a.workspaceId, p_ip_hash: ip })
    expect(owner.error?.code).toBe('42501')
  })
})
