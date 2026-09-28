import { describe, expect, test } from 'vitest'
import { isFresh, ORG_TONES, orgTone, rankRepos } from './sidebar-rank'

const NOW = Date.parse('2026-09-28T12:00:00Z')

function repo(name: string, activity: number[], date?: string) {
  return {
    name,
    activity,
    updated_at: '2020-01-01T00:00:00Z',
    last_commit: date
      ? {
          hash: 'h',
          subject: 's',
          author: { name: 'a', email: 'a@b', date },
        }
      : null,
  }
}

describe('rankRepos', () => {
  const cases: {
    name: string
    repos: ReturnType<typeof repo>[]
    active: string[]
    quiet: string[]
  }[] = [
    { name: 'empty', repos: [], active: [], quiet: [] },
    {
      name: 'active sorted by newest commit, quiet by name',
      repos: [
        repo('o/zeta', [0, 0, 0, 0, 0]),
        repo('o/old', [0, 1, 0, 0, 0], '2026-09-01T00:00:00Z'),
        repo('o/new', [0, 0, 0, 0, 2], '2026-09-27T00:00:00Z'),
        repo('o/alpha', [5, 0, 0, 0, 0], '2026-06-01T00:00:00Z'),
      ],
      active: ['o/new', 'o/old'],
      quiet: ['o/alpha', 'o/zeta'],
    },
    {
      name: 'ties break by name',
      repos: [
        repo('o/b', [1], '2026-09-20T00:00:00Z'),
        repo('o/a', [1], '2026-09-20T00:00:00Z'),
      ],
      active: ['o/a', 'o/b'],
      quiet: [],
    },
  ]
  for (const c of cases) {
    test(c.name, () => {
      const got = rankRepos(c.repos)
      expect(got.active.map((r) => r.name)).toEqual(c.active)
      expect(got.quiet.map((r) => r.name)).toEqual(c.quiet)
    })
  }
})

describe('isFresh', () => {
  const cases: { name: string; date?: string; want: boolean }[] = [
    { name: 'yesterday', date: '2026-09-27T12:00:00Z', want: true },
    { name: 'eight days ago', date: '2026-09-20T11:00:00Z', want: false },
    { name: 'no commit uses stale update time', want: false },
    { name: 'bad date', date: 'nope', want: false },
  ]
  for (const c of cases) {
    test(c.name, () => {
      expect(isFresh(repo('o/r', [], c.date), NOW)).toBe(c.want)
    })
  }
})

describe('orgTone', () => {
  const cases = ['awee-ai', 'toaweme', 'github.com/x', '']
  for (const org of cases) {
    test(`stable for ${JSON.stringify(org)}`, () => {
      expect(ORG_TONES).toContain(orgTone(org))
      expect(orgTone(org)).toBe(orgTone(org))
    })
  }

  test('spreads orgs across the palette', () => {
    const seen = new Set(
      Array.from({ length: 60 }, (_, i) => orgTone(`org-${i}`)),
    )
    expect(seen.size).toBe(ORG_TONES.length)
  })

  test('never picks a status tone', () => {
    for (const t of ORG_TONES) expect(t).toMatch(/^org-\d$/)
  })
})
