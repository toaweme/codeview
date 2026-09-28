import type { Repo, Tag } from '@/api/types'
import { ACTIVE_WEEKS } from './sidebar-rank'

// STACK_TOP is how many repositories get their own shade in an org's weekly
// chart before the rest fold into one.
export const STACK_TOP = 5

const DAY = 24 * 3600 * 1000

type Stat = Pick<Repo, 'name' | 'activity' | 'latest_tag' | 'contributors'>

export type OrgStats = {
  repos: number
  // commits and contributors cover the latest ACTIVE_WEEKS weeks.
  commits: number
  contributors: number
  release: { repo: string; tag: Tag } | null
}

// orgStats sums an org's recent commits, dedupes its contributors across
// repositories and finds its newest release.
export function orgStats(repos: readonly Stat[]): OrgStats {
  const people = new Set<string>()
  let commits = 0
  let release: OrgStats['release'] = null
  for (const r of repos) {
    for (const n of r.activity.slice(-ACTIVE_WEEKS)) commits += n
    for (const e of r.contributors ?? []) people.add(e)
    const tag = r.latest_tag
    if (
      tag &&
      (!release ||
        Date.parse(tag.tagged_at) > Date.parse(release.tag.tagged_at))
    )
      release = { repo: r.name, tag }
  }
  return { repos: repos.length, commits, contributors: people.size, release }
}

export type WeekStack = {
  // series names the repositories with their own shade, busiest first, and
  // ends with null for the folded rest when there is any.
  series: (string | null)[]
  // weeks holds per week the counts aligned with series, oldest week first.
  weeks: number[][]
}

// stackWeeks stacks weekly commits by repository, keeping the top busiest
// repositories apart and folding the others into one series.
export function stackWeeks(
  repos: readonly Pick<Repo, 'name' | 'activity'>[],
  top = STACK_TOP,
): WeekStack {
  const length = Math.max(0, ...repos.map((r) => r.activity.length))
  const busy = repos
    .map((r) => ({
      r,
      total: r.activity.reduce((a, b) => a + b, 0),
    }))
    .filter((x) => x.total > 0)
    .sort((a, b) => b.total - a.total || a.r.name.localeCompare(b.r.name))
  const own = busy.slice(0, top)
  const rest = busy.slice(top)
  const series: (string | null)[] = own.map((x) => x.r.name)
  if (rest.length > 0) series.push(null)
  // activity is aligned on its newest week
  const at = (r: Pick<Repo, 'activity'>, w: number) =>
    r.activity[w - (length - r.activity.length)] ?? 0
  const weeks = Array.from({ length }, (_, w) => {
    const counts = own.map((x) => at(x.r, w))
    if (rest.length > 0) counts.push(rest.reduce((n, x) => n + at(x.r, w), 0))
    return counts
  })
  return { series, weeks }
}

// weekStart is the first day of week w of n weeks ending with the current
// UTC day, matching how the server buckets activity.
export function weekStart(w: number, n: number, now: number): Date {
  const end = Math.floor(now / DAY) * DAY + DAY
  return new Date(end - (n - w) * 7 * DAY)
}
