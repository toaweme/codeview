import { describe, expect, test } from 'vitest'
import type { Bucket } from './filters'
import { chooseBucket, MIN_SLOTS, padSlots } from './histogram-buckets'

describe('chooseBucket', () => {
  const cases: [number, Bucket][] = [
    [0, 'day'],
    [1, 'day'],
    [4, 'day'],
    [5, 'week'],
    [156, 'week'],
    [157, 'month'],
  ]
  for (const [weeks, want] of cases) {
    test(`${weeks} weeks`, () => expect(chooseBucket(weeks)).toBe(want))
  }
})

function days(from: string, n: number) {
  const d = new Date(from)
  return Array.from({ length: n }, (_, i) => {
    const s = new Date(d)
    s.setUTCDate(d.getUTCDate() + i)
    return { start: s.toISOString(), count: i + 1 }
  })
}

describe('padSlots', () => {
  const cases: {
    name: string
    buckets: { start: string; count: number }[]
    bucket: Bucket
    len: number
    pads: number
    firstStart?: string
  }[] = [
    { name: 'empty', buckets: [], bucket: 'day', len: 0, pads: 0 },
    {
      name: 'one day',
      buckets: days('2025-03-12T00:00:00Z', 1),
      bucket: 'day',
      len: MIN_SLOTS.day,
      pads: MIN_SLOTS.day - 1,
      firstStart: '2025-02-27T00:00:00.000Z',
    },
    {
      name: 'three days',
      buckets: days('2025-03-01T00:00:00Z', 3),
      bucket: 'day',
      len: MIN_SLOTS.day,
      pads: MIN_SLOTS.day - 3,
      firstStart: '2025-02-18T00:00:00.000Z',
    },
    {
      name: 'exactly minimum',
      buckets: days('2025-03-01T00:00:00Z', MIN_SLOTS.day),
      bucket: 'day',
      len: MIN_SLOTS.day,
      pads: 0,
    },
    {
      name: 'long range unchanged',
      buckets: days('2025-01-01T00:00:00Z', 200),
      bucket: 'day',
      len: 200,
      pads: 0,
    },
    {
      name: 'weeks step by seven days',
      buckets: [{ start: '2025-03-10T00:00:00Z', count: 2 }],
      bucket: 'week',
      len: MIN_SLOTS.week,
      pads: MIN_SLOTS.week - 1,
      firstStart: '2024-12-23T00:00:00.000Z',
    },
    {
      name: 'months step by month',
      buckets: [{ start: '2025-03-01T00:00:00Z', count: 2 }],
      bucket: 'month',
      len: MIN_SLOTS.month,
      pads: MIN_SLOTS.month - 1,
      firstStart: '2024-04-01T00:00:00.000Z',
    },
  ]
  for (const c of cases) {
    test(c.name, () => {
      const got = padSlots(c.buckets, c.bucket)
      expect(got).toHaveLength(c.len)
      expect(got.filter((s) => s.pad)).toHaveLength(c.pads)
      expect(got.filter((s) => s.pad).every((s) => s.count === 0)).toBe(true)
      expect(
        got.slice(c.pads).map(({ start, count }) => ({ start, count })),
      ).toEqual(c.buckets)
      if (c.firstStart) expect(got[0]?.start).toBe(c.firstStart)
    })
  }
})
