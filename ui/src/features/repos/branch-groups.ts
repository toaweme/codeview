import type { ActivityBranch } from '@/api/types'
import { isBotBranch } from './versions'

export type BranchSort = 'recent' | 'unmerged' | 'behind'

export const BRANCH_SORTS: { value: BranchSort; label: string }[] = [
  { value: 'recent', label: 'Recently updated' },
  { value: 'unmerged', label: 'Most unmerged commits' },
  { value: 'behind', label: 'Furthest behind' },
]

export type BranchGroups = {
  people: ActivityBranch[]
  bots: ActivityBranch[]
  merged: ActivityBranch[]
}

export function groupBranches(
  branches: readonly ActivityBranch[],
  sort: BranchSort,
): BranchGroups {
  const by = (b: ActivityBranch) =>
    sort === 'unmerged' ? b.ahead : sort === 'behind' ? b.behind : 0
  const list = branches.toSorted(
    (a, b) =>
      by(b) - by(a) || Date.parse(b.updatedAt) - Date.parse(a.updatedAt),
  )
  const out: BranchGroups = { people: [], bots: [], merged: [] }
  for (const b of list) {
    if (b.ahead === 0) out.merged.push(b)
    else if (isBotBranch(b.name)) out.bots.push(b)
    else out.people.push(b)
  }
  return out
}

const commits = (n: number) =>
  `${n.toLocaleString()} ${n === 1 ? 'commit' : 'commits'}`

export function aheadLabel(n: number, base = 'the default branch'): string {
  return `${commits(n)} not in ${base}`
}

export function behindLabel(n: number, base = 'the default branch'): string {
  return `${commits(n)} behind ${base}`
}
