import { type UseQueryResult, useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { useEffect, useMemo, useRef, useState } from 'react'
import { activityQuery } from '@/api/queries'
import type { ActivityTag, Repo, RepoList } from '@/api/types'
import { SearchInput } from '@/components/search-input'
import { Empty, ErrorState } from '@/features/shell/states'
import { rankPaths } from '@/lib/fuzzy'
import { usePressPreload } from '@/lib/preload'
import { formatFull, relativeTime } from '@/lib/time'
import { repoLink } from '@/lib/url'
import { releaseLink, shortRepo } from './activity-links'
import {
  CommitFeed,
  Panel,
  PanelEmpty,
  RowsSkeleton,
  TagLabel,
} from './activity-panels'
import { overviewLink } from './overview-nav'
import { RepoTile, RepoTileSkeleton } from './repo-tile'
import { type Release, splitTag } from './versions'

const FEED_ROWS = 15
const LATEST_RELEASES = 6

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
  const [sel, setSel] = useState(0)
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
        <SearchInput
          value={filter}
          onChange={(v) => {
            setFilter(v)
            setSel(0)
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setSel((s) => Math.min(s + 1, results.length - 1))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setSel((s) => Math.max(s - 1, 0))
            } else if (e.key === 'Enter') {
              open(sel)
            }
          }}
          placeholder="Filter repositories"
          className="w-full max-w-72"
        />
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
                    index={i}
                  />
                ))}
          </ul>
        )}
      </section>
      {(activity.isPending ||
        (activity.data && latestReleases(activity.data.tags).length > 0)) && (
        <Panel
          title="Latest releases"
          more={{ link: overviewLink(org, 'releases'), label: 'All releases' }}
        >
          {activity.isPending ? (
            <ReleaseStripSkeleton />
          ) : (
            activity.data && (
              <ReleaseStrip
                releases={latestReleases(activity.data.tags)}
                org={org}
              />
            )
          )}
        </Panel>
      )}
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

function latestReleases(tags: ActivityTag[]): Release[] {
  const seen = new Set<string>()
  const out: Release[] = []
  for (const t of tags) {
    if (seen.has(t.repo)) continue
    const name = splitTag(t.name)
    if (!name.isVersion) continue
    seen.add(t.repo)
    out.push({ ...t, ...name })
    if (out.length === LATEST_RELEASES) break
  }
  return out
}

const CARD = 'flex h-16 min-w-0 flex-col justify-center rounded-lg px-3'

function ReleaseStrip({
  releases,
  org,
}: {
  releases: Release[]
  org?: string
}) {
  const preload = usePressPreload()
  return (
    <ul className="grid grid-cols-[repeat(auto-fit,minmax(14rem,1fr))] gap-1">
      {releases.map((r) => {
        const link = releaseLink(r)
        return (
          <li key={`${r.repo}@${r.name}`} className="min-w-0">
            <Link
              {...link}
              {...preload(link)}
              title={`${r.name}, tagged ${formatFull(r.taggedAt)}`}
              className={`${CARD} transition-colors duration-75 hover:bg-hover focus-visible:outline-2 focus-visible:outline-ring`}
            >
              <span className="min-w-0 truncate font-medium text-base text-foreground">
                {shortRepo(r.repo, org)}
              </span>
              <span className="flex min-w-0 items-baseline gap-2 text-faint text-sm">
                <TagLabel release={r} />
                <span className="num ml-auto shrink-0 whitespace-nowrap">
                  {relativeTime(r.taggedAt)}
                </span>
              </span>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}

function ReleaseStripSkeleton() {
  return (
    <div
      className="grid grid-cols-[repeat(auto-fit,minmax(14rem,1fr))] gap-1"
      aria-hidden
    >
      {Array.from({ length: LATEST_RELEASES }, (_, i) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: static placeholder cards
          key={i}
          className={`${CARD} gap-2`}
        >
          <div className="h-3.5 w-1/2 animate-pulse rounded-md bg-muted" />
          <div className="h-3 w-3/4 animate-pulse rounded-md bg-muted" />
        </div>
      ))}
    </div>
  )
}
