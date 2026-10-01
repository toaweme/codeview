import { groupLink } from '@/lib/url'

// tabs live in the query string because every path under a group names a repo
export const OVERVIEW_VIEWS = [
  'overview',
  'activity',
  'releases',
  'branches',
] as const

export type OverviewView = (typeof OVERVIEW_VIEWS)[number]

export const OVERVIEW_LABELS: Record<OverviewView, string> = {
  overview: 'Overview',
  activity: 'Activity',
  releases: 'Releases',
  branches: 'Branches',
}

// overviewTab is the label of a non-default tab, for the page title
export function overviewTab(search: OverviewSearch): string | undefined {
  return search.view && OVERVIEW_LABELS[search.view]
}

export type OverviewSearch = {
  view?: Exclude<OverviewView, 'overview'>
  repos?: string
}

export function parseOverviewSearch(
  search: Record<string, unknown>,
): OverviewSearch {
  const v = search.view
  if (v !== 'activity' && v !== 'releases' && v !== 'branches') return {}
  const repos = formatRepoFilter(parseRepoFilter(search.repos))
  return repos ? { view: v, repos } : { view: v }
}

export function parseRepoFilter(raw: unknown): string[] {
  if (typeof raw !== 'string') return []
  const out: string[] = []
  for (const r of raw.split(',')) {
    const name = r.trim()
    if (name && !out.includes(name)) out.push(name)
  }
  return out
}

export function formatRepoFilter(repos: readonly string[]): string | undefined {
  return repos.length > 0 ? repos.join(',') : undefined
}

export function overviewLink(org: string | undefined, view: OverviewView) {
  const search: OverviewSearch = view === 'overview' ? {} : { view }
  return org ? { ...groupLink(org), search } : { to: '/' as const, search }
}
