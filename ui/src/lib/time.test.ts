import { describe, expect, test } from 'vitest'
import { ageRatio, relativeTime } from './time'

describe('relativeTime', () => {
  const now = Date.parse('2026-09-24T12:00:00Z')
  const cases: [string, string][] = [
    ['2026-09-24T11:59:30Z', 'just now'],
    ['2026-09-24T11:55:00Z', '5 minutes ago'],
    ['2026-09-24T09:00:00Z', '3 hours ago'],
    ['2026-09-23T12:00:00Z', 'yesterday'],
    ['2026-09-10T12:00:00Z', '2 weeks ago'],
    ['2025-09-01T12:00:00Z', 'last year'],
    ['nope', ''],
  ]
  for (const [iso, want] of cases) {
    test(iso, () => expect(relativeTime(iso, now)).toBe(want))
  }
})

test('ageRatio clamps', () => {
  const a = Date.parse('2020-01-01T00:00:00Z')
  const b = Date.parse('2021-01-01T00:00:00Z')
  expect(ageRatio('2019-01-01T00:00:00Z', a, b)).toBe(0)
  expect(ageRatio('2022-01-01T00:00:00Z', a, b)).toBe(1)
  expect(ageRatio('2020-07-02T00:00:00Z', a, b)).toBeCloseTo(0.5, 1)
})
