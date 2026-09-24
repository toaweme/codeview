import { describe, expect, test } from 'vitest'
import type { ActivityBranch } from '@/api/types'
import {
  aheadLabel,
  type BranchSort,
  behindLabel,
  groupBranches,
} from './branch-groups'

const branch = (
  name: string,
  ahead: number,
  behind: number,
  day: number,
): ActivityBranch => ({
  repo: 'seed/chi',
  name,
  commit: name,
  subject: name,
  updatedAt: new Date(Date.UTC(2026, 0, day)).toISOString(),
  ahead,
  behind,
})

const branches = [
  branch('old', 5, 1, 1),
  branch('new', 1, 88, 9),
  branch('mid', 5, 3, 5),
  branch('done', 0, 40, 8),
  branch('renovate/x', 2, 0, 7),
]

describe('groupBranches', () => {
  const cases: {
    sort: BranchSort
    people: string[]
    bots: string[]
    merged: string[]
  }[] = [
    {
      sort: 'recent',
      people: ['new', 'mid', 'old'],
      bots: ['renovate/x'],
      merged: ['done'],
    },
    {
      sort: 'unmerged',
      people: ['mid', 'old', 'new'],
      bots: ['renovate/x'],
      merged: ['done'],
    },
    {
      sort: 'behind',
      people: ['new', 'mid', 'old'],
      bots: ['renovate/x'],
      merged: ['done'],
    },
  ]
  for (const c of cases)
    test(c.sort, () => {
      const g = groupBranches(branches, c.sort)
      expect(g.people.map((b) => b.name)).toEqual(c.people)
      expect(g.bots.map((b) => b.name)).toEqual(c.bots)
      expect(g.merged.map((b) => b.name)).toEqual(c.merged)
    })
})

describe('labels', () => {
  const cases: { got: string; want: string }[] = [
    { got: aheadLabel(1, 'main'), want: '1 commit not in main' },
    { got: aheadLabel(3, 'main'), want: '3 commits not in main' },
    { got: behindLabel(88, 'main'), want: '88 commits behind main' },
    { got: behindLabel(1), want: '1 commit behind the default branch' },
  ]
  for (const c of cases)
    test(c.want, () => {
      expect(c.got).toBe(c.want)
    })
})
