import { type UseQueryResult, useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { useEffect, useMemo, useRef, useState } from 'react'
import { activityQuery } from '@/api/queries'
import type { Repo, RepoList } from '@/api/types'
import { SearchInput } from '@/components/search-input'
import { Empty, ErrorState } from '@/features/shell/states'
import { cn } from '@/lib/cn'
import { rankPaths } from '@/lib/fuzzy'
import { groupRepos, repoBase, shiftPositions } from '@/lib/repo-name'
import { groupLink, repoLink } from '@/lib/url'
import { shortRepo } from './activity-links'
import {
  CommitFeed,
  Panel,
  PanelEmpty,
  RowsSkeleton,
  TEXT_LINK,
} from './activity-panels'
import { overviewLink } from './overview-nav'
import { RepoTile, RepoTileSkeleton } from './repo-tile'
import { useRepoNames } from './use-repo-names'

const FEED_ROWS = 15

const GRID = 'grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3'

type Section = {
  group?: string
  label?: string
  items: { repo: Repo; name: string; positions: number[] }[]
}

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
  const listRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  const names = useRepoNames()
  const sections = useMemo((): Section[] => {
    const short = (name: string) => shortRepo(name, org, names.display)
    if (filter) {
      const byName = new Map(scope.map((r) => [r.name, r]))
      const ranked = rankPaths(
        filter,
        scope.map((r) => r.name),
        scope.length,
      ).map((m) => ({
        repo: byName.get(m.path) as Repo,
        name: short(m.path),
        positions: shiftPositions(
          m.positions,
          m.path.length - short(m.path).length,
        ),
      }))
      return [{ items: ranked }]
    }
    const groups = groupRepos(scope)
    const headed =
      groups.length > 1 || (!!groups[0]?.parent && groups[0].parent !== org)
    if (!headed)
      return [
        {
          items: scope.map((r) => ({
            repo: r,
            name: short(r.name),
            positions: [],
          })),
        },
      ]
    return groups.map((g) => ({
      group: g.parent,
      label: g.parent ? short(g.parent) : 'Ungrouped',
      items: g.repos.map((r) => ({
        repo: r,
        name: repoBase(r.name),
        positions: [],
      })),
    }))
  }, [scope, filter, org, names])
  const results = useMemo(() => sections.flatMap((s) => s.items), [sections])

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
          <Link
            {...overviewLink(org, 'releases')}
            className={cn(TEXT_LINK, 'ml-auto')}
          >
            All releases
          </Link>
        </div>
        {repos.isError ? (
          <ErrorState error={repos.error} />
        ) : repos.data && results.length === 0 ? (
          <Empty>
            {filter ? 'No repository matches.' : 'No repositories yet.'}
          </Empty>
        ) : (
          <div ref={listRef} className="flex flex-col gap-6">
            {repos.isPending ? (
              <ul className={GRID}>
                {Array.from({ length: 6 }, (_, i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: static placeholder tiles
                  <RepoTileSkeleton key={i} />
                ))}
              </ul>
            ) : (
              sections.map((s, si) => {
                const offset = sections
                  .slice(0, si)
                  .reduce((n, x) => n + x.items.length, 0)
                return (
                  <section key={s.group ?? ''} className="flex flex-col gap-3">
                    {s.label !== undefined && (
                      <h2 className="flex h-7 items-center font-medium text-muted-foreground">
                        {s.group ? (
                          <Link
                            {...groupLink(s.group)}
                            title={s.group}
                            className="truncate rounded-md transition-colors duration-100 hover:text-foreground"
                          >
                            {s.label}
                          </Link>
                        ) : (
                          s.label
                        )}
                        <span className="num pl-2 text-faint text-sm">
                          {s.items.length}
                        </span>
                      </h2>
                    )}
                    <ul className={GRID}>
                      {s.items.map(({ repo, name, positions }, j) => {
                        const i = offset + j
                        return (
                          <RepoTile
                            key={repo.name}
                            repo={repo}
                            name={name}
                            positions={positions}
                            selected={i === sel}
                            onHover={() => setSel(i)}
                            onLeave={() => setSel(null)}
                            index={i}
                          />
                        )
                      })}
                    </ul>
                  </section>
                )
              })
            )}
          </div>
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
