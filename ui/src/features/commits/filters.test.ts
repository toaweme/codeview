import { describe, expect, test } from 'vitest'
import {
  bucketDays,
  filterLabel,
  formatOffset,
  monthGrid,
  overlaps,
  parseHistoryFilter,
  parseISODate,
  presetRange,
  rangeLabel,
  toISODate,
  widen,
} from './filters'

// a Wednesday, local time
const now = new Date(2025, 2, 12, 15, 30)

describe('presetRange', () => {
  const cases: [Parameters<typeof presetRange>[0], string, string][] = [
    ['today', '2025-03-12', '2025-03-12'],
    ['7d', '2025-03-06', '2025-03-12'],
    ['30d', '2025-02-11', '2025-03-12'],
    ['month', '2025-03-01', '2025-03-12'],
    ['last-month', '2025-02-01', '2025-02-28'],
    ['year', '2025-01-01', '2025-03-12'],
  ]
  for (const [id, since, until] of cases) {
    test(id, () => expect(presetRange(id, now)).toEqual({ since, until }))
  }
  test('last month across a year', () =>
    expect(presetRange('last-month', new Date(2025, 0, 5))).toEqual({
      since: '2024-12-01',
      until: '2024-12-31',
    }))
  test('last month of a leap february', () =>
    expect(presetRange('last-month', new Date(2024, 2, 31))).toEqual({
      since: '2024-02-01',
      until: '2024-02-29',
    }))
})

describe('parseHistoryFilter', () => {
  const cases: [string, Record<string, unknown>, unknown][] = [
    ['empty', {}, {}],
    ['preset', { range: '7d' }, { range: '7d' }],
    [
      'preset wins over days',
      { range: 'year', since: '2025-01-01' },
      { range: 'year' },
    ],
    [
      'unknown preset falls back to days',
      { range: 'decade', since: '2025-01-01' },
      { since: '2025-01-01' },
    ],
    [
      'days',
      { since: '2025-01-01', until: '2025-01-31' },
      { since: '2025-01-01', until: '2025-01-31' },
    ],
    [
      'reversed days',
      { since: '2025-02-01', until: '2025-01-01' },
      { since: '2025-01-01', until: '2025-02-01' },
    ],
    ['invalid day', { since: '2025-02-30', until: 'soon' }, {}],
    ['text is trimmed', { author: '  ada ', grep: ' ' }, { author: 'ada' }],
    ['numeric text', { author: 42 }, { author: '42' }],
    ['committer dates', { date: 'committer' }, { date: 'committer' }],
    ['author dates are the default', { date: 'author' }, {}],
    ['unknown keys dropped', { mode: 'direct', page: 2 }, {}],
  ]
  for (const [name, search, want] of cases) {
    test(name, () => expect(parseHistoryFilter(search)).toEqual(want))
  }
})

describe('dates', () => {
  test('round trip', () =>
    expect(toISODate(parseISODate('2024-02-29') as Date)).toBe('2024-02-29'))
  test('rejects rollover', () => expect(parseISODate('2025-02-29')).toBeNull())
  const offsets: [number, string][] = [
    [0, '+00:00'],
    [-120, '+02:00'],
    [300, '-05:00'],
    [-345, '+05:45'],
  ]
  for (const [minutes, want] of offsets) {
    test(`offset ${minutes}`, () => expect(formatOffset(minutes)).toBe(want))
  }
  test('month grid starts on monday', () => {
    const grid = monthGrid(2025, 2)
    expect(grid).toHaveLength(42)
    expect(toISODate(grid[0] as Date)).toBe('2025-02-24')
    expect(toISODate(grid[41] as Date)).toBe('2025-04-06')
  })
})

describe('buckets', () => {
  const cases: [string, 'day' | 'week' | 'month', string, string][] = [
    ['2025-01-06T00:00:00Z', 'week', '2025-01-06', '2025-01-12'],
    ['2025-02-01T00:00:00Z', 'month', '2025-02-01', '2025-02-28'],
    ['2025-02-03T00:00:00Z', 'day', '2025-02-03', '2025-02-03'],
  ]
  for (const [start, bucket, since, until] of cases) {
    test(`${bucket} ${start}`, () =>
      expect(bucketDays(start, bucket)).toEqual({ since, until }))
  }
  test('overlap', () => {
    const b = { since: '2025-01-06', until: '2025-01-12' }
    expect(overlaps(b, {})).toBe(true)
    expect(overlaps(b, { since: '2025-01-12' })).toBe(true)
    expect(overlaps(b, { since: '2025-01-13' })).toBe(false)
    expect(overlaps(b, { until: '2025-01-05' })).toBe(false)
    expect(overlaps(b, { since: '2025-01-01', until: '2025-01-06' })).toBe(true)
  })
})

describe('labels', () => {
  const cases: [Record<string, string>, string][] = [
    [{}, 'Any time'],
    [{ since: '2025-03-01', until: '2025-03-01' }, 'Mar 1'],
    [{ since: '2025-03-01', until: '2025-03-12' }, 'Mar 1 to Mar 12'],
    [
      { since: '2024-12-01', until: '2025-01-12' },
      'Dec 1, 2024 to Jan 12, 2025',
    ],
    [{ since: '2025-03-01' }, 'Since Mar 1'],
    [{ until: '2024-03-01' }, 'Until Mar 1, 2024'],
  ]
  for (const [range, want] of cases) {
    test(want, () => expect(rangeLabel(range, now)).toBe(want))
  }
  test('preset name', () =>
    expect(filterLabel({ range: '30d' }, now)).toBe('Last 30 days'))
})

describe('widen', () => {
  test('doubles the span on both sides, up to today', () =>
    expect(widen({ since: '2025-03-01', until: '2025-03-10' }, now)).toEqual({
      since: '2025-02-19',
      until: '2025-03-12',
    }))
  test('short spans grow by a week', () =>
    expect(widen({ since: '2025-01-10', until: '2025-01-10' }, now)).toEqual({
      since: '2025-01-03',
      until: '2025-01-17',
    }))
  test('open end stays open', () =>
    expect(widen({ since: '2025-03-10' }, now)).toEqual({
      since: '2025-03-03',
      until: undefined,
    }))
})
