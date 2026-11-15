import { randomBytes, randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import {
  anonClient,
  createBookableResource,
  createOwner,
  deleteCreatedOwners,
  serviceClient,
  type BookableResource,
  type Db,
  type TestOwner,
} from './helpers'

// T21 - Image upload path (S1, D9, DATABASE.md 5.4).
//  * set_resource_image refuses a foreign owner, a locked resource, a path
//    outside <resource>/ (migration 8 layout) and a path with "..".
//  * It records a good path and NULL removes it.
//  * Browser roles (anon, a logged-in owner) cannot list or write the bucket;
//    public files are readable; the bucket refuses other types and > 2 MiB.
// (The server flow itself - validation, ordering, clean-up - is tested through
// the app in tests/ui/resources.spec.ts.)

const BUCKET = 'resource-images'
// A real 1x1 PNG.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

test.describe('T21 set_resource_image', () => {
  let service: Db
  let a: TestOwner
  let b: TestOwner
  let ra: BookableResource
  let rb: BookableResource

  test.beforeAll(async () => {
    service = serviceClient()
    a = await createOwner()
    b = await createOwner()
    ra = await createBookableResource(a)
    rb = await createBookableResource(b)
  })

  test.afterAll(async () => {
    await deleteCreatedOwners()
  })

  const call = (owner: string, resource: string, path: string | null) =>
    service.rpc('set_resource_image', { p_owner_id: owner, p_resource_id: resource, p_path: path as unknown as string })
  const stored = async (owner: TestOwner, resourceId: string) =>
    (await owner.client.from('resources').select('image_path').eq('id', resourceId).single()).data?.image_path

  test('a good path is recorded and NULL removes it', async () => {
    const path = `${ra.resourceId}/${randomUUID()}.png`
    expect((await call(a.id, ra.resourceId, path)).error).toBeNull()
    expect(await stored(a, ra.resourceId)).toBe(path)
    expect((await call(a.id, ra.resourceId, null)).error).toBeNull()
    expect(await stored(a, ra.resourceId)).toBeNull()
  })

  test('a foreign owner is refused and nothing changes', async () => {
    // B asks to change A's resource, with B's own folder or with A's folder.
    // (The path rule is checked first, so A's folder gives invalid_path; B's own
    // folder passes the path rule and is stopped by the ownership check.)
    expect((await call(b.id, ra.resourceId, `${ra.resourceId}/x.png`)).error?.message).toBe('resource_not_found')
    expect((await call(b.id, ra.resourceId, `${b.id}/${ra.resourceId}/x.png`)).error?.message).toBe('invalid_path') // the old layout is refused
    // ...and the other way round.
    expect((await call(a.id, rb.resourceId, `${rb.resourceId}/x.png`)).error?.message).toBe('resource_not_found')
    expect(await stored(a, ra.resourceId)).toBeNull()
    expect(await stored(b, rb.resourceId)).toBeNull()
    // Unknown ids too.
    const unknown = randomUUID()
    expect((await call(a.id, unknown, `${unknown}/x.png`)).error?.message).toBe('resource_not_found')
  })

  test('a path outside <resource>/, the old layout, "..", or anything but one plain file name is refused', async () => {
    const other = randomUUID()
    const r = ra.resourceId
    const bad = [
      `${other}/x.png`, // another resource's folder
      `${rb.resourceId}/x.png`, // another resource of another owner
      `${a.id}/${r}/x.png`, // the OLD layout (owner id first)
      `${r}`, // no slash and file name
      `${r}/`, // folder only
      `${r}/../${rb.resourceId}/x.png`,
      `${r}/..x.png`,
      `${r}/sub/x.png`, // a second folder level
      `${r}/x`, // no extension
      `${r}/x.png/`, // trailing slash
      `${r}/x%2e.png`, // odd characters
      `${r}/x?.png`,
      `${r}/x#.png`,
      `${r}/x\\y.png`, // a backslash
      `${r}/x y.png`,
      `${r}/.png`,
      `/${r}/x.png`,
      `x.png`,
      '',
    ]
    for (const path of bad) {
      const res = await call(a.id, ra.resourceId, path)
      expect(res.error?.message, `"${path}" must be refused`).toBe('invalid_path')
    }
    expect(await stored(a, ra.resourceId)).toBeNull()
  })

  test('a locked resource refuses a new path and NULL', async () => {
    // Pro, two workspaces with a resource each, then back to Free: everything locks.
    const c = await createOwner()
    const sub = await service
      .from('subscriptions')
      .update({ plan: 'pro', status: 'active', stripe_subscription_id: `sub_test_${randomBytes(8).toString('hex')}` })
      .eq('owner_id', c.id)
      .select('plan')
    expect(sub.error).toBeNull()
    const first = await createBookableResource(c)
    await createBookableResource(c)
    // A good image while still unlocked, so "NULL is refused" is meaningful.
    const path = `${first.resourceId}/${randomUUID()}.png`
    expect((await call(c.id, first.resourceId, path)).error).toBeNull()

    const down = await service
      .from('subscriptions')
      .update({ plan: 'free', status: 'canceled', stripe_subscription_id: null })
      .eq('owner_id', c.id)
      .select('plan')
    expect(down.error).toBeNull()
    const locked = await c.client.from('resources').select('is_locked').eq('id', first.resourceId).single()
    expect(locked.data?.is_locked, 'the resource is locked').toBe(true)

    const again = await call(c.id, first.resourceId, `${first.resourceId}/${randomUUID()}.png`)
    expect(again.error?.message).toBe('resource_locked')
    expect((await call(c.id, first.resourceId, null)).error?.message).toBe('resource_locked')
    expect(await stored(c, first.resourceId), 'the recorded image is unchanged').toBe(path)
  })
})

test.describe('T21 the bucket', () => {
  let service: Db
  const uploaded: string[] = []

  test.beforeAll(() => {
    service = serviceClient()
  })

  test.afterAll(async () => {
    if (uploaded.length > 0) await service.storage.from(BUCKET).remove(uploaded)
  })

  test('the server key can write; the file is publicly readable by address', async () => {
    const path = `t21-${randomUUID()}/${randomUUID()}.png`
    const up = await service.storage.from(BUCKET).upload(path, PNG, { contentType: 'image/png' })
    expect(up.error).toBeNull()
    uploaded.push(path)

    const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`
    const res = await fetch(url)
    expect(res.status, 'a public file needs no login').toBe(200)
    expect(res.headers.get('content-type')).toMatch(/image\/png/)
  })

  test('anon cannot upload, replace, delete or list', async () => {
    const anon = anonClient()
    const path = `t21-${randomUUID()}/${randomUUID()}.png`

    const up = await anon.storage.from(BUCKET).upload(path, PNG, { contentType: 'image/png' })
    expect(up.error, 'anon upload refused').not.toBeNull()

    // A real file to attack.
    const real = `t21-${randomUUID()}/${randomUUID()}.png`
    expect((await service.storage.from(BUCKET).upload(real, PNG, { contentType: 'image/png' })).error).toBeNull()
    uploaded.push(real)

    const replace = await anon.storage.from(BUCKET).upload(real, Buffer.from('evil'), { contentType: 'image/png', upsert: true })
    expect(replace.error, 'anon replace refused').not.toBeNull()
    const del = await anon.storage.from(BUCKET).remove([real])
    expect(del.error !== null || (del.data ?? []).length === 0, 'anon delete removes nothing').toBe(true)
    const listed = await anon.storage.from(BUCKET).list(real.split('/')[0])
    expect(listed.error !== null || (listed.data ?? []).length === 0, 'anon cannot list').toBe(true)

    // The file is still there and unchanged.
    const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${real}`)
    expect(res.status).toBe(200)
    expect((await res.arrayBuffer()).byteLength).toBe(PNG.length)
  })

  test('a logged-in owner has no write or list rights on the bucket either', async () => {
    const owner = await createOwner()
    try {
      const path = `${randomUUID()}/${randomUUID()}.png`
      const up = await owner.client.storage.from(BUCKET).upload(path, PNG, { contentType: 'image/png' })
      expect(up.error, 'owner upload refused (uploads go through the server only)').not.toBeNull()
      const listed = await owner.client.storage.from(BUCKET).list(path.split('/')[0])
      expect(listed.error !== null || (listed.data ?? []).length === 0, 'owner cannot list').toBe(true)
    } finally {
      await deleteCreatedOwners()
    }
  })

  test('the bucket itself refuses other file types and files over 2 MiB, even from the server key', async () => {
    const text = await service.storage.from(BUCKET).upload(`t21-${randomUUID()}/a.txt`, Buffer.from('hello'), { contentType: 'text/plain' })
    expect(text.error, 'text/plain refused').not.toBeNull()
    const svg = await service.storage.from(BUCKET).upload(`t21-${randomUUID()}/a.svg`, Buffer.from('<svg/>'), { contentType: 'image/svg+xml' })
    expect(svg.error, 'svg refused').not.toBeNull()

    const bigPath = `t21-${randomUUID()}/big.png`
    const big = await service.storage.from(BUCKET).upload(bigPath, Buffer.alloc(2 * 1024 * 1024 + 1), { contentType: 'image/png' })
    if (!big.error) uploaded.push(bigPath)
    expect(big.error, 'over 2 MiB refused').not.toBeNull()
  })
})
