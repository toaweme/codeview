import { expect, test } from 'vitest'
import type { Ref } from '@/api/types'
import { buildPresets, middleTruncate } from './presets'

const ref = (name: string, day: number): Ref => ({
  name,
  commit: name,
  updatedAt: `2026-01-${String(day).padStart(2, '0')}T00:00:00Z`,
})

test('buildPresets caps the list and ranks bot branches last', () => {
  const got = buildPresets({
    default: 'main',
    tags: [ref('v1.0.0', 1), ref('v1.1.0', 2)],
    branches: [
      ref('main', 20),
      ref('dependabot/go_modules/all-9908eff506', 19),
      ref('copilot/fix-b6fbe4f5', 18),
      ref('feature/search', 5),
      ref('fix/layout', 10),
    ],
  }).map((p) => `${p.from}..${p.to}`)
  expect(got).toEqual([
    'v1.1.0..main',
    'v1.0.0..v1.1.0',
    'main..fix/layout',
    'main..feature/search',
  ])
})

test('buildPresets falls back to bot branches when nothing else exists', () => {
  const got = buildPresets({
    default: 'main',
    tags: [],
    branches: [ref('main', 2), ref('renovate/deps', 1)],
  }).map((p) => p.to)
  expect(got).toEqual(['renovate/deps'])
})

test('middleTruncate keeps both ends of long names', () => {
  const cases: [string, number, string][] = [
    ['main', 24, 'main'],
    ['abcdefghij', 5, 'ab…ij'],
    ['dependabot/go_modules/all-9908eff506', 24, 'dependabot/g…-9908eff506'],
  ]
  for (const [in_, max, want] of cases) {
    const got = middleTruncate(in_, max)
    expect(got).toBe(want)
    expect(got.length).toBeLessThanOrEqual(max)
  }
})
