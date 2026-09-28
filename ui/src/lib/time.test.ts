import { describe, expect, test } from 'vitest'
import { ageRatio, ageStep, relativeTime, spanLabel } from './time'

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

describe('ageStep', () => {
  const cases: [number, number][] = [
    [0, 0],
    [0.05, 0],
    [0.1, 1],
    [0.55, 5],
    [0.99, 9],
    [1, 9],
    [-1, 0],
  ]
  for (const [ratio, want] of cases) {
    test(String(ratio), () => expect(ageStep(ratio)).toBe(want))
  }
})

describe('spanLabel', () => {
  const now = new Date(2026, 8, 28)
  const cases: [string, Date, Date, string][] = [
    ['same month', new Date(2026, 8, 1), new Date(2026, 8, 7), '1 to 7 Sep'],
    [
      'across months',
      new Date(2026, 7, 25),
      new Date(2026, 8, 1),
      '25 Aug to 1 Sep',
    ],
    ['one day', new Date(2026, 8, 3), new Date(2026, 8, 3), '3 Sep'],
    [
      'past year',
      new Date(2025, 8, 1),
      new Date(2025, 8, 7),
      '1 to 7 Sep 2025',
    ],
    [
      'across years',
      new Date(2025, 11, 29),
      new Date(2026, 0, 4),
      '29 Dec 2025 to 4 Jan 2026',
    ],
  ]
  for (const [name, since, until, want] of cases) {
    test(name, () => expect(spanLabel(since, until, now)).toBe(want))
  }
})
