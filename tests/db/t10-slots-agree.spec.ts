import { expect, test } from '@playwright/test'
import { tzOffset } from '@date-fns/tz'
import {
  addDaysToDate,
  endInstantForWall,
  firstInstantForWall,
  instantsForWall,
  isBookableStart,
  todayInZone,
  type AvailabilityWindow,
} from '../../src/lib/time/slots'
import { bookingArgs, createOwner, deleteCreatedOwners, readOnlySql, serviceClient, type Db, type TestOwner } from './helpers'

// T10 - The app's slot rules agree with the database (DATABASE.md 7.2 and 7.2.1,
// ARCHITECTURE A10 to A12, AVAIL-03, AVAIL-05, Q7).
//
// For many start moments (every 15 minutes around clock changes, plus misaligned
// ones) we ask BOTH the app (src/lib/time isBookableStart) and the live database
// (submit_booking). They must give the same answer:
//   app ok          <-> the database accepts the booking, with the same ends_at
//   app invalid_slot <-> the database says invalid_slot
//   app past        <-> the database says past
//   app too_far     <-> the database says too_far
// The database checks the slot (steps 3 to 5) BEFORE "past" and "too far" (steps 6),
// so a valid slot on a date in the past answers "past" and a valid slot beyond 90
// days answers "too_far": that lets us test the REAL 2026 clock changes (the repeated
// hour, the skipped hour, slots ending inside them) on any date, without waiting for
// a clock change to fall inside the next 90 days. Slots that are accepted are really
// inserted (a Pro test owner, so the monthly limit is not reached) and deleted after.

// Pacific/Kiritimati (+14) and Pacific/Pago_Pago (-11) sit at the far ends of the clock: a weekday or a
// 90-day limit taken from the UTC date instead of the workspace's own date would be wrong there.
const ZONES = ['Europe/London', 'America/New_York', 'Australia/Sydney', 'Pacific/Kiritimati', 'Pacific/Pago_Pago'] as const
const SLOT_LENGTHS = [30, 45, 60, 90] as const

// Clock-change dates of 2026 (all 24-hour days in the past of "now", 2026-11-15 or later).
const CHANGE_DATES: Record<(typeof ZONES)[number], string[]> = {
  'Europe/London': ['2026-03-29', '2026-10-25'],
  'America/New_York': ['2026-03-08', '2026-11-01'],
  'Australia/Sydney': ['2026-04-05', '2026-10-04'],
  'Pacific/Kiritimati': ['2026-03-29', '2026-10-25'], // no clock changes here: control dates
  'Pacific/Pago_Pago': ['2026-03-29', '2026-10-25'], // no clock changes here: control dates
}

// A DIFFERENT window on different weekdays, so a wrong weekday (for example from the UTC date) changes the answer:
// odd weekdays open 00:30, even ones 01:00; every third weekday closes 22:30, the others 24:00.
const WINDOWS: AvailabilityWindow[] = [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({
  weekday,
  opensAt: weekday % 2 === 1 ? '00:30' : '01:00',
  closesAt: weekday % 3 === 0 ? '22:30' : '24:00',
}))

interface Case {
  zone: (typeof ZONES)[number]
  slot: number
  resourceId: string
}

async function inBatches<T, R>(items: T[], size: number, run: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = []
  for (let i = 0; i < items.length; i += size) out.push(...(await Promise.all(items.slice(i, i + size).map(run))))
  return out
}

test.describe('T10 app slot rules agree with submit_booking', () => {
  test.setTimeout(280_000)

  let service: Db
  let owner: TestOwner
  const cases: Case[] = []
  const insertedBookings: string[] = []

  test.beforeAll(async () => {
    service = serviceClient()
    owner = await createOwner()
    // Pro, so five workspaces, 25 resources and 1000 bookings a month are allowed.
    const sub = await service
      .from('subscriptions')
      .update({ plan: 'pro', status: 'active', stripe_subscription_id: `sub_test_${Math.random().toString(16).slice(2)}${Date.now()}` })
      .eq('owner_id', owner.id)
      .select('plan')
    expect(sub.error).toBeNull()

    for (const zone of ZONES) {
      const ws = await owner.client
        .from('workspaces')
        .insert({ owner_id: owner.id, name: `T10 ${zone}`, slug: `t10-${zone.toLowerCase().replace(/[^a-z]/g, '-')}-${Date.now().toString(36)}`, time_zone: zone })
        .select('id')
        .single()
      expect(ws.error, `workspace ${zone}`).toBeNull()
      for (const slot of SLOT_LENGTHS) {
        const res = await owner.client
          .from('resources')
          .insert({ workspace_id: ws.data!.id, owner_id: owner.id, name: `${zone} ${slot}`, slot_minutes: slot, capacity: 5 })
          .select('id')
          .single()
        expect(res.error, `resource ${zone} ${slot}`).toBeNull()
        const hours = await owner.client.from('resource_availability').insert(
          WINDOWS.map((w) => ({ resource_id: res.data!.id, weekday: w.weekday, opens_at: w.opensAt, closes_at: w.closesAt })),
        )
        expect(hours.error).toBeNull()
        cases.push({ zone, slot, resourceId: res.data!.id })
      }
    }
  })

  test.afterAll(async () => {
    // Accepted bookings are removed first (the owners' cascade would remove them too).
    for (const id of insertedBookings) await owner.client.from('bookings').delete().eq('id', id)
    await deleteCreatedOwners()
  })

  /** Asks the app and the database about one start; returns a description of any disagreement. */
  async function compare(c: Case, startsAt: Date): Promise<{ problem: string | null; accepted: boolean }> {
    const app = isBookableStart({ slotMinutes: c.slot, windows: WINDOWS, timeZone: c.zone, startsAt, now: new Date() })
    const db = await service.rpc('submit_booking', bookingArgs(c.resourceId, startsAt.toISOString()))
    const label = `${c.zone} ${c.slot}min ${startsAt.toISOString()}`
    if (db.error === null) {
      const row = db.data?.[0]
      insertedBookings.push(row.booking_id)
      if (!app.ok) return { problem: `${label}: the database ACCEPTED a start the app refuses (${app.reason})`, accepted: true }
      const dbEnd = new Date(row.booking_ends_at).getTime()
      if (dbEnd !== app.endsAt.getTime()) {
        return { problem: `${label}: ends_at differs: database ${new Date(dbEnd).toISOString()} vs app ${app.endsAt.toISOString()}`, accepted: true }
      }
      return { problem: null, accepted: true }
    }
    if (app.ok) return { problem: `${label}: the app offers a start the database refuses (${db.error.message})`, accepted: false }
    if (db.error.message !== app.reason) {
      return { problem: `${label}: the app says ${app.reason}, the database says ${db.error.message}`, accepted: false }
    }
    return { problem: null, accepted: false }
  }

  /** 15-minute steps (plus a few misaligned ones) from 21:00 the evening before to 08:00 on a date. */
  function instantsAround(zone: string, date: string): Date[] {
    const midnight = firstInstantForWall(Date.parse(`${date}T00:00:00Z`), zone)!
    const from = midnight - 3 * 3600_000
    const out: Date[] = []
    for (let t = from; t <= midnight + 8 * 3600_000; t += 15 * 60_000) out.push(new Date(t))
    for (let t = from + 7 * 60_000; t <= midnight + 8 * 3600_000; t += 97 * 60_000) out.push(new Date(t)) // misaligned
    return out
  }

  for (const zone of ZONES) {
    for (const date of CHANGE_DATES[zone]) {
      test(`${zone} ${date}: the repeated hour, the skipped hour and slot ends agree (all slot lengths)`, async () => {
        const mine = cases.filter((c) => c.zone === zone)
        let validSeen = 0
        let invalidSeen = 0
        for (const c of mine) {
          const results = await inBatches(instantsAround(zone, date), 12, (t) => compare(c, t))
          const problems = results.filter((r) => r.problem).map((r) => r.problem)
          expect(problems, `${zone} ${date} ${c.slot} min`).toEqual([])
          // On these (past) dates a "valid" start is answered "past": nothing is inserted.
          for (const t of instantsAround(zone, date)) {
            const app = isBookableStart({ slotMinutes: c.slot, windows: WINDOWS, timeZone: zone, startsAt: t, now: new Date() })
            if (app.ok || ('reason' in app && app.reason !== 'invalid_slot')) validSeen++
            else invalidSeen++
          }
        }
        expect(validSeen, 'some starts were valid slots (so the test is not vacuous)').toBeGreaterThan(20)
        expect(invalidSeen, 'some starts were refused (second copy, skipped hour, misaligned)').toBeGreaterThan(20)
      })
    }
  }

  test('ordinary days: offered slots are accepted with the same ends_at; limits and past agree', async () => {
    const sixty = cases.filter((c) => c.slot === 60)
    let accepted = 0
    for (const c of sixty) {
      const tried = new Set<number>() // the windows of neighbouring days overlap: never book one instant twice
      const today = todayInZone(c.zone)
      // Yesterday (past), a few days ahead (accepted), exactly 90 days ahead (accepted), 91 days (too_far).
      for (const offset of [-1, 3, 90, 91]) {
        const date = addDaysToDate(today, offset)
        const midnight = firstInstantForWall(Date.parse(`${date}T00:00:00Z`), c.zone)!
        const starts: Date[] = []
        for (let t = midnight + 6 * 3600_000; t < midnight + 11 * 3600_000; t += 15 * 60_000) starts.push(new Date(t))
        // ...and 3 hours either side of local midnight (the 90-day limit and the weekday change there).
        for (let t = midnight - 3 * 3600_000; t < midnight + 3 * 3600_000; t += 15 * 60_000) starts.push(new Date(t))
        // ...and the evening, where the 22:30 closing time of every third weekday matters.
        for (let t = midnight + 20 * 3600_000; t < midnight + 24 * 3600_000; t += 15 * 60_000) starts.push(new Date(t))
        const fresh = starts.filter((t) => !tried.has(t.getTime()))
        fresh.forEach((t) => tried.add(t.getTime()))
        const results = await inBatches(fresh, 10, (t) => compare(c, t))
        expect(results.filter((r) => r.problem).map((r) => r.problem), `${c.zone} day ${offset}`).toEqual([])
        accepted += results.filter((r) => r.accepted).length
      }
    }
    expect(accepted, 'real bookings were accepted (and ends_at compared)').toBeGreaterThan(20)
  })

  // Clock changes that fall inside the next 90 days (they move through the year, so this
  // is found at run time). Here accepted slots are REALLY inserted, so ends_at of slots
  // that cross or end inside a clock change is compared with the database too. On the
  // days the project was written there was none; the test then reports that and passes.
  test('clock changes inside the next 90 days (when there are any): accepted slots and their ends_at agree', async () => {
    const found: { zone: (typeof ZONES)[number]; date: string }[] = []
    for (const zone of ZONES) {
      const today = todayInZone(zone)
      for (let d = 1; d <= 88; d++) {
        const date = addDaysToDate(today, d)
        const noon = Date.parse(`${date}T12:00:00Z`)
        if (tzOffset(zone, new Date(noon - 24 * 3600_000)) !== tzOffset(zone, new Date(noon))) found.push({ zone, date })
      }
    }
    test.info().annotations.push({ type: 'clock changes in the next 90 days', description: JSON.stringify(found) })
    for (const { zone, date } of found) {
      // 45-minute slots are skipped on purpose: on a clocks-forward day they can overlap in real
      // time and the database answers slot_taken for the second one (known limitation, DATABASE.md 7.2.1).
      for (const c of cases.filter((x) => x.zone === zone && x.slot !== 45)) {
        const results = await inBatches(instantsAround(zone, addDaysToDate(date, 0)), 10, (t) => compare(c, t))
        expect(results.filter((r) => r.problem).map((r) => r.problem), `${zone} ${date} ${c.slot}`).toEqual([])
        expect(results.some((r) => r.accepted), `${zone} ${date}: real bookings were accepted`).toBe(true)
      }
    }
  })

  test('PostgreSQL resolves a repeated and a skipped wall time the way the app model assumes (read-only SQL)', async () => {
    // The app model: a repeated wall time has two instants, and PostgreSQL's "local at time zone"
    // gives the LATER one; a skipped wall time is resolved with the offset from BEFORE the change.
    // (The function then moves a repeated END to the first copy; that step is read from the function.)
    const probes = [
      { zone: 'Europe/London', wall: '2026-10-25 01:30:00' }, // repeated
      { zone: 'Europe/London', wall: '2026-03-29 01:30:00' }, // skipped
      { zone: 'America/New_York', wall: '2026-11-01 01:30:00' },
      { zone: 'America/New_York', wall: '2026-03-08 02:30:00' },
      { zone: 'Australia/Sydney', wall: '2026-04-05 02:30:00' },
      { zone: 'Australia/Sydney', wall: '2026-10-04 02:30:00' },
      { zone: 'Asia/Dhaka', wall: '2026-10-25 01:30:00' },
    ]
    const sql = probes
      .map((p, i) => `select ${i} as i, extract(epoch from (timestamp '${p.wall}') at time zone '${p.zone}')::bigint as epoch`)
      .join(' union all ')
    const rows = readOnlySql(sql + ' order by i')
    expect(rows).toHaveLength(probes.length)
    for (const row of rows) {
      const p = probes[Number(row.i)]
      const wall = Date.parse(p.wall.replace(' ', 'T') + 'Z')
      const all = instantsForWall(wall, p.zone)
      const pg = Number(row.epoch) * 1000
      if (all.length === 2) expect(pg, `${p.zone} ${p.wall}: repeated -> PostgreSQL gives the later copy`).toBe(all[1])
      else if (all.length === 1) expect(pg, `${p.zone} ${p.wall}: normal`).toBe(all[0])
      else {
        // skipped: PostgreSQL's value is the app's end resolution for a skipped wall time
        expect(pg, `${p.zone} ${p.wall}: skipped -> offset from before the change`).toBe(endInstantForWall(wall, p.zone))
      }
    }
    // The probes really cover all three situations.
    const kinds = new Set(probes.map((p) => instantsForWall(Date.parse(p.wall.replace(' ', 'T') + 'Z'), p.zone).length))
    expect([...kinds].sort()).toEqual([0, 1, 2])
  })

  // The dates of clock changes are in the past, so submit_booking answers "past" before it
  // would return an end, and ends_at cannot be compared through bookings. Instead this runs
  // a COPY of the function's step 5 (the end of the slot, with the move to the first copy of
  // a repeated hour; supabase/migrations/20261114153115_functions.sql, "Step 5") as a
  // read-only query, for every 15-minute wall start of each clock-change day and every slot
  // length, and compares it with the app's endInstantForWall. If the function's end logic is
  // ever changed, this query copy must be changed with it (a limit of this test: it checks a
  // copy of the logic, not the function itself).
  test('slot ends on clock-change days: the app equals the database end logic (read-only SQL copy of step 5)', async () => {
    const rows: { zone: string; wall: number; slot: number }[] = []
    for (const zone of ZONES) {
      for (const date of CHANGE_DATES[zone]) {
        const midnight = Date.parse(`${date}T00:00:00Z`)
        for (const slot of SLOT_LENGTHS) {
          for (let m = 0; m < 24 * 60; m += 15) rows.push({ zone, wall: midnight + m * 60_000, slot })
        }
      }
    }
    const values = rows
      .map((r, i) => `(${i}, '${r.zone}', timestamp '${new Date(r.wall).toISOString().slice(0, 19).replace('T', ' ')}', ${r.slot})`)
      .join(',')
    const sql = `
      with p(i, tz, ls, mins) as (values ${values}),
      a as (select i, tz, ls + pg_catalog.make_interval(mins => mins) as le,
                   (ls + pg_catalog.make_interval(mins => mins)) at time zone tz as e from p),
      b as (select i, tz, le, e,
                   (e at time zone tz) - (e at time zone 'UTC') as off_end,
                   ((e - interval '24 hours') at time zone tz) - ((e - interval '24 hours') at time zone 'UTC') as off_prev from a)
      select i, extract(epoch from case
               when off_prev > off_end and ((e - (off_prev - off_end)) at time zone tz) = le then e - (off_prev - off_end)
               else e end)::bigint as epoch
      from b order by i`
    const out = readOnlySql(sql)
    expect(out).toHaveLength(rows.length)
    const wrong: string[] = []
    for (const row of out) {
      const r = rows[Number(row.i)]
      const app = endInstantForWall(r.wall + r.slot * 60_000, r.zone)
      if (Number(row.epoch) * 1000 !== app) {
        wrong.push(`${r.zone} ${new Date(r.wall).toISOString()} +${r.slot}: function ${new Date(Number(row.epoch) * 1000).toISOString()} vs app ${new Date(app).toISOString()}`)
      }
    }
    expect(wrong.slice(0, 5), `${wrong.length} of ${rows.length} ends differ`).toEqual([])
    // Not vacuous: the rows include ends inside a repeated hour and inside a skipped hour.
    const inRepeated = rows.filter((r) => instantsForWall(r.wall + r.slot * 60_000, r.zone).length === 2).length
    const inSkipped = rows.filter((r) => instantsForWall(r.wall + r.slot * 60_000, r.zone).length === 0).length
    expect(inRepeated, 'ends inside a repeated hour were compared').toBeGreaterThan(10)
    expect(inSkipped, 'ends inside a skipped hour were compared').toBeGreaterThan(10)
  })

  test('a start in the near past and a start exactly on a slot but outside the opening hours are refused like the app says', async () => {
    const c = cases.find((x) => x.zone === 'Europe/London' && x.slot === 60)!
    // 00:00 local is before the 00:30 opening time: invalid_slot, whatever the date.
    const date = addDaysToDate(todayInZone(c.zone), 5)
    const midnight = firstInstantForWall(Date.parse(`${date}T00:00:00Z`), c.zone)!
    const before = await compare(c, new Date(midnight))
    expect(before).toEqual({ problem: null, accepted: false })
    const db = await service.rpc('submit_booking', bookingArgs(c.resourceId, new Date(midnight).toISOString()))
    expect(db.error?.message).toBe('invalid_slot')
  })
})
