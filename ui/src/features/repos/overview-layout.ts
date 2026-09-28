import type { Repo } from '@/api/types'
import { isActive, lastCommitAt } from './sidebar-rank'

// QUIET_PREVIEW is how many quiet repositories a collapsed list shows.
export const QUIET_PREVIEW = 5

type Ranked = Pick<Repo, 'name' | 'activity' | 'last_commit' | 'updated_at'>

const newestFirst = (a: Ranked, b: Ranked) =>
  lastCommitAt(b) - lastCommitAt(a) || a.name.localeCompare(b.name)

// splitByLife separates repositories with recent commits from quiet ones,
// both newest commit first, using the sidebar's rule for active.
export function splitByLife<T extends Ranked>(
  repos: readonly T[],
): { active: T[]; quiet: T[] } {
  const active: T[] = []
  const quiet: T[] = []
  for (const r of repos) (isActive(r) ? active : quiet).push(r)
  return { active: active.sort(newestFirst), quiet: quiet.sort(newestFirst) }
}

export type GroupLayout<T> = {
  active: T[]
  // quiet holds the quiet repositories on screen, hidden counts the rest.
  quiet: T[]
  hidden: number
}

// layoutGroup ranks a group and trims its quiet list unless expanded.
export function layoutGroup<T extends Ranked>(
  repos: readonly T[],
  expanded: boolean,
  preview = QUIET_PREVIEW,
): GroupLayout<T> {
  const { active, quiet } = splitByLife(repos)
  const shown = expanded ? quiet : quiet.slice(0, preview)
  return { active, quiet: shown, hidden: quiet.length - shown.length }
}

// indexLayouts numbers the visible repositories of consecutive groups,
// active ones before quiet ones, so keyboard selection walks the page in
// reading order. It returns each group's first index and the flat order.
export function indexLayouts<T>(layouts: readonly GroupLayout<T>[]): {
  offsets: number[]
  order: T[]
} {
  const offsets: number[] = []
  const order: T[] = []
  for (const l of layouts) {
    offsets.push(order.length)
    order.push(...l.active, ...l.quiet)
  }
  return { offsets, order }
}
