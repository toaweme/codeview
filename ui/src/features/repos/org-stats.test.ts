import { describe, expect, test } from 'vitest'
import { orgStats, stackWeeks, weekStart } from './org-stats'

const weeks = (...last: number[]) => [
  ...Array(12 - last.length).fill(0),
  ...last,
]

function repo(
  name: string,
  activity: number[],
  contributors?: string[],
  tag?: [string, string],
) {
  return {
    name,
    activity,
    contributors,
    latest_tag: tag ? { name: tag[0], commit: 'c', tagged_at: tag[1] } : null,
  }
}

describe('orgStats', () => {
  const cases: {
    name: string
    repos: ReturnType<typeof repo>[]
    commits: number
    contributors: number
    release: string | null
  }[] = [
    { name: 'empty', repos: [], commits: 0, contributors: 0, release: null },
    {
      name: 'counts only the latest four weeks',
      repos: [repo('a', weeks(9, 0, 0, 0, 0)), repo('b', weeks(1, 2, 0, 3))],
      commits: 6,
      contributors: 0,
      release: null,
    },
    {
      name: 'dedupes contributors across repos and picks the newest tag',
      repos: [
        repo('a', weeks(1), ['ada@x', 'bob@x'], ['v1', '2026-01-01T00:00:00Z']),
        repo('b', weeks(2), ['bob@x', 'cy@x'], ['v9', '2026-03-01T00:00:00Z']),
        repo('c', weeks(), undefined, ['v5', '2026-02-01T00:00:00Z']),
      ],
      commits: 3,
      contributors: 3,
      release: 'b@v9',
    },
  ]
  for (const c of cases) {
    test(c.name, () => {
      const got = orgStats(c.repos)
      expect(got.repos).toBe(c.repos.length)
      expect(got.commits).toBe(c.commits)
      expect(got.contributors).toBe(c.contributors)
      expect(got.release && `${got.release.repo}@${got.release.tag.name}`).toBe(
        c.release,
      )
    })
  }
})

describe('stackWeeks', () => {
  const cases: {
    name: string
    repos: { name: string; activity: number[] }[]
    top: number
    series: (string | null)[]
    weeks: number[][]
  }[] = [
    { name: 'empty', repos: [], top: 2, series: [], weeks: [] },
    {
      name: 'single repo',
      repos: [{ name: 'a', activity: [1, 0, 2] }],
      top: 2,
      series: ['a'],
      weeks: [[1], [0], [2]],
    },
    {
      name: 'busiest first, rest folded, idle repos dropped',
      repos: [
        { name: 'small', activity: [1, 0, 0] },
        { name: 'big', activity: [3, 3, 3] },
        { name: 'idle', activity: [0, 0, 0] },
        { name: 'mid', activity: [0, 2, 2] },
        { name: 'tiny', activity: [0, 0, 1] },
      ],
      top: 2,
      series: ['big', 'mid', null],
      weeks: [
        [3, 0, 1],
        [3, 2, 0],
        [3, 2, 1],
      ],
    },
    {
      name: 'ties break by name',
      repos: [
        { name: 'b', activity: [1] },
        { name: 'a', activity: [1] },
      ],
      top: 1,
      series: ['a', null],
      weeks: [[1, 1]],
    },
    {
      name: 'shorter histories align on the newest week',
      repos: [
        { name: 'a', activity: [1, 1, 1] },
        { name: 'b', activity: [5] },
      ],
      top: 5,
      series: ['b', 'a'],
      weeks: [
        [0, 1],
        [0, 1],
        [5, 1],
      ],
    },
  ]
  for (const c of cases) {
    test(c.name, () => {
      const got = stackWeeks(c.repos, c.top)
      expect(got.series).toEqual(c.series)
      expect(got.weeks).toEqual(c.weeks)
    })
  }
})

describe('weekStart', () => {
  const now = Date.parse('2026-09-28T15:00:00Z')
  const cases: { w: number; n: number; want: string }[] = [
    { w: 11, n: 12, want: '2026-09-22T00:00:00.000Z' },
    { w: 0, n: 12, want: '2026-07-07T00:00:00.000Z' },
  ]
  for (const c of cases) {
    test(`week ${c.w} of ${c.n}`, () => {
      expect(weekStart(c.w, c.n, now).toISOString()).toBe(c.want)
    })
  }
})
