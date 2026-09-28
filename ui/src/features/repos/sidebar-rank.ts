import type { Repo } from '@/api/types'

const DAY = 24 * 3600 * 1000

// ACTIVE_WEEKS is how many of the latest activity weeks count a repository
// as active.
export const ACTIVE_WEEKS = 4

// ORG_TONES are the org palette theme tokens, calm hues that stay distinct
// in both themes and never read as a status.
export const ORG_TONES = [
  'org-1',
  'org-2',
  'org-3',
  'org-4',
  'org-5',
  'org-6',
] as const

export type OrgTone = (typeof ORG_TONES)[number]

// orgTone picks a stable tone for a group path, so an org keeps its colour
// across reloads and machines.
export function orgTone(org: string): OrgTone {
  let h = 2166136261
  for (let i = 0; i < org.length; i++) {
    h ^= org.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return ORG_TONES[(h >>> 0) % ORG_TONES.length]
}

// orgColor is the CSS colour of a group path's tone, a neutral one for
// repositories without a group.
export function orgColor(org: string): string {
  return org ? `var(--${orgTone(org)})` : 'var(--faint)'
}

type Ranked = Pick<Repo, 'name' | 'activity' | 'last_commit' | 'updated_at'>

// lastCommitAt is the time of the newest commit, falling back to the last
// update when the repository has no commit summary.
export function lastCommitAt(r: Ranked): number {
  const t = Date.parse(r.last_commit?.author.date ?? r.updated_at)
  return Number.isNaN(t) ? 0 : t
}

// isActive reports commits in any of the latest ACTIVE_WEEKS weeks.
export function isActive(r: Ranked): boolean {
  return r.activity.slice(-ACTIVE_WEEKS).some((n) => n > 0)
}

// isFresh reports a commit within the last seven days.
export function isFresh(r: Ranked, now: number): boolean {
  const t = lastCommitAt(r)
  return t > 0 && now - t <= 7 * DAY
}

// rankRepos splits a group into active repositories, newest commit first,
// and quiet ones by name.
export function rankRepos<T extends Ranked>(
  repos: readonly T[],
): { active: T[]; quiet: T[] } {
  const active: T[] = []
  const quiet: T[] = []
  for (const r of repos) (isActive(r) ? active : quiet).push(r)
  active.sort(
    (a, b) => lastCommitAt(b) - lastCommitAt(a) || a.name.localeCompare(b.name),
  )
  quiet.sort((a, b) => a.name.localeCompare(b.name))
  return { active, quiet }
}
