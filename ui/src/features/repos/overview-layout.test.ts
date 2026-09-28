import { describe, expect, test } from 'vitest'
import { indexLayouts, layoutGroup, splitByLife } from './overview-layout'

function repo(name: string, recent: boolean, date?: string) {
  const activity = Array(12).fill(0)
  if (recent) activity[11] = 1
  return {
    name,
    activity,
    updated_at: '2020-01-01T00:00:00Z',
    last_commit: date
      ? { hash: 'h', subject: 's', author: { name: 'a', email: 'a@b', date } }
      : null,
  }
}

const names = (rs: { name: string }[]) => rs.map((r) => r.name)

describe('splitByLife', () => {
  const cases: {
    name: string
    repos: ReturnType<typeof repo>[]
    active: string[]
    quiet: string[]
  }[] = [
    { name: 'empty', repos: [], active: [], quiet: [] },
    {
      name: 'both sides newest first',
      repos: [
        repo('a', false, '2026-01-01T00:00:00Z'),
        repo('b', true, '2026-09-01T00:00:00Z'),
        repo('c', false, '2026-05-01T00:00:00Z'),
        repo('d', true, '2026-09-20T00:00:00Z'),
      ],
      active: ['d', 'b'],
      quiet: ['c', 'a'],
    },
    {
      name: 'ties and missing commits fall back to name',
      repos: [repo('z', false), repo('m', false), repo('k', false)],
      active: [],
      quiet: ['k', 'm', 'z'],
    },
  ]
  for (const c of cases) {
    test(c.name, () => {
      const got = splitByLife(c.repos)
      expect(names(got.active)).toEqual(c.active)
      expect(names(got.quiet)).toEqual(c.quiet)
    })
  }
})

describe('layoutGroup', () => {
  const quiet = Array.from({ length: 7 }, (_, i) =>
    repo(`q${i}`, false, `2026-0${i + 1}-01T00:00:00Z`),
  )
  const cases: {
    name: string
    expanded: boolean
    repos: ReturnType<typeof repo>[]
    active: number
    quiet: string[]
    hidden: number
  }[] = [
    {
      name: 'collapsed keeps the newest quiet ones',
      expanded: false,
      repos: [repo('live', true, '2026-09-01T00:00:00Z'), ...quiet],
      active: 1,
      quiet: ['q6', 'q5', 'q4'],
      hidden: 4,
    },
    {
      name: 'expanded shows every quiet one',
      expanded: true,
      repos: quiet,
      active: 0,
      quiet: ['q6', 'q5', 'q4', 'q3', 'q2', 'q1', 'q0'],
      hidden: 0,
    },
    {
      name: 'short list hides nothing',
      expanded: false,
      repos: quiet.slice(0, 2),
      active: 0,
      quiet: ['q1', 'q0'],
      hidden: 0,
    },
  ]
  for (const c of cases) {
    test(c.name, () => {
      const got = layoutGroup(c.repos, c.expanded, 3)
      expect(got.active).toHaveLength(c.active)
      expect(names(got.quiet)).toEqual(c.quiet)
      expect(got.hidden).toBe(c.hidden)
    })
  }
})

describe('indexLayouts', () => {
  const cases: {
    name: string
    layouts: { active: string[]; quiet: string[]; hidden: number }[]
    offsets: number[]
    order: string[]
  }[] = [
    { name: 'empty', layouts: [], offsets: [], order: [] },
    {
      name: 'active before quiet, group after group',
      layouts: [
        { active: ['a1', 'a2'], quiet: ['a3'], hidden: 4 },
        { active: [], quiet: ['b1', 'b2'], hidden: 0 },
        { active: ['c1'], quiet: [], hidden: 0 },
      ],
      offsets: [0, 3, 5],
      order: ['a1', 'a2', 'a3', 'b1', 'b2', 'c1'],
    },
  ]
  for (const c of cases) {
    test(c.name, () => {
      const got = indexLayouts(c.layouts)
      expect(got.offsets).toEqual(c.offsets)
      expect(got.order).toEqual(c.order)
    })
  }
})
