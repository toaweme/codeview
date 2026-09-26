import { type UseQueryResult, useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { Tag } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { activityQuery } from '@/api/queries'
import type { Repo, RepoList } from '@/api/types'
import { SearchInput } from '@/components/search-input'
import { Button } from '@/components/ui/button'
import { Empty, ErrorState } from '@/features/shell/states'
import { rankPaths } from '@/lib/fuzzy'
import { repoLink } from '@/lib/url'
import { CommitFeed, Panel, PanelEmpty, RowsSkeleton } from './activity-panels'
import { overviewLink } from './overview-nav'
import { RepoTile, RepoTileSkeleton } from './repo-tile'

const FEED_ROWS = 15

export function OverviewTab({
  org,
  scope,
  repos,
}: {
  org?: string
  scope: Repo[]
  repos: UseQueryResult<RepoList>
}) {
  const activity = useQuery(activityQuery(org))
  const [filter, setFilter] = useState('')
  const [sel, setSel] = useState<number | null>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const navigate = useNavigate()

  const results = useMemo(() => {
    const byName = new Map(scope.map((r) => [r.name, r]))
    return rankPaths(
      filter,
      scope.map((r) => r.name),
      scope.length,
    ).map((m) => ({ repo: byName.get(m.path) as Repo, positions: m.positions }))
  }, [scope, filter])

  useEffect(() => {
    if (sel === null) return
    listRef.current
      ?.querySelector(`[data-index="${sel}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  }, [sel])

  const open = (i: number) => {
    const r = results[i]?.repo
    if (r) navigate(repoLink(r.name, { kind: 'tree', path: '' }))
  }

  return (
    <>
      <section className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <SearchInput
            value={filter}
            onChange={(v) => {
              setFilter(v)
              setSel(v ? 0 : null)
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setSel((s) =>
                  s === null ? 0 : Math.min(s + 1, results.length - 1),
                )
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setSel((s) => (s === null ? 0 : Math.max(s - 1, 0)))
              } else if (e.key === 'Enter') {
                open(sel ?? 0)
              }
            }}
            placeholder="Filter repositories"
            className="w-full max-w-72"
          />
          <Button asChild variant="outline" size="md" className="ml-auto">
            <Link {...overviewLink(org, 'releases')}>
              <Tag aria-hidden />
              All releases
            </Link>
          </Button>
        </div>
        {repos.isError ? (
          <ErrorState error={repos.error} />
        ) : repos.data && results.length === 0 ? (
          <Empty>
            {filter ? 'No repository matches.' : 'No repositories yet.'}
          </Empty>
        ) : (
          <ul
            ref={listRef}
            className="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3"
          >
            {repos.isPending
              ? Array.from({ length: 6 }, (_, i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: static placeholder tiles
                  <RepoTileSkeleton key={i} />
                ))
              : results.map(({ repo, positions }, i) => (
                  <RepoTile
                    key={repo.name}
                    repo={repo}
                    name={org ? repo.name.slice(org.length + 1) : repo.name}
                    positions={
                      org
                        ? positions
                            .map((p) => p - org.length - 1)
                            .filter((p) => p >= 0)
                        : positions
                    }
                    selected={i === sel}
                    onHover={() => setSel(i)}
                    onLeave={() => setSel(null)}
                    index={i}
                  />
                ))}
          </ul>
        )}
      </section>
      <Panel
        title="Recent activity"
        more={{
          link: overviewLink(org, 'activity'),
          label: 'View all activity',
        }}
      >
        {activity.isPending ? (
          <RowsSkeleton rows={8} />
        ) : activity.isError ? (
          <ErrorState error={activity.error} />
        ) : activity.data.commits.length === 0 ? (
          <PanelEmpty>No commits yet.</PanelEmpty>
        ) : (
          <CommitFeed
            commits={activity.data.commits.slice(0, FEED_ROWS)}
            org={org}
          />
        )}
      </Panel>
    </>
  )
}
