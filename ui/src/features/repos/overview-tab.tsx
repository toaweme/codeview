import { type UseQueryResult, useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { useEffect, useMemo, useRef, useState } from 'react'
import { activityQuery } from '@/api/queries'
import type { Repo, RepoList } from '@/api/types'
import { SearchInput } from '@/components/search-input'
import { Empty, ErrorState } from '@/features/shell/states'
import { cn } from '@/lib/cn'
import { rankPaths } from '@/lib/fuzzy'
import { GUIDE_URL } from '@/lib/links'
import { groupRepos, repoBase, shiftPositions } from '@/lib/repo-name'
import { repoLink } from '@/lib/url'
import { usePersistedState } from '@/lib/use-persisted-state'
import { shortRepo } from './activity-links'
import {
  CommitFeed,
  Panel,
  PanelEmpty,
  RowsSkeleton,
  TEXT_LINK,
} from './activity-panels'
import { OrgStrip } from './org-strip'
import { indexLayouts, layoutGroup } from './overview-layout'
import { overviewLink } from './overview-nav'
import { QuietList } from './quiet-list'
import { RepoTile, RepoTileSkeleton } from './repo-tile'
import { useRepoNames } from './use-repo-names'

const FEED_ROWS = 15

const GRID = 'grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3'

type Item = { repo: Repo; name: string; positions: number[] }

type Section = {
  group?: string
  label?: string
  repos: Repo[]
  active: Item[]
  quiet: Item[]
  quietTotal: number
  hidden: number
  offset: number
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
  const [expanded, setExpanded] = usePersistedState<Record<string, boolean>>(
    'overview:quiet-expanded',
    {},
  )
  const { sections, results } = useMemo(() => {
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
      const flat: Section = {
        repos: scope,
        active: ranked,
        quiet: [],
        quietTotal: 0,
        hidden: 0,
        offset: 0,
      }
      return { sections: [flat], results: ranked }
    }
    const item = (r: Repo): Item => ({
      repo: r,
      name: repoBase(r.name),
      positions: [],
    })
    const groups = groupRepos(scope)
    const layouts = groups.map((g) =>
      layoutGroup(g.repos, expanded[g.parent] ?? false),
    )
    const { offsets } = indexLayouts(layouts)
    const sections = groups.map(
      (g, i): Section => ({
        group: g.parent,
        label: g.parent ? short(g.parent) : 'Ungrouped',
        repos: g.repos,
        active: layouts[i].active.map(item),
        quiet: layouts[i].quiet.map(item),
        quietTotal: layouts[i].quiet.length + layouts[i].hidden,
        hidden: layouts[i].hidden,
        offset: offsets[i],
      }),
    )
    return {
      sections,
      results: sections.flatMap((s) => [...s.active, ...s.quiet]),
    }
  }, [scope, filter, org, names, expanded])

  useEffect(() => {
    if (sel === null) return
    listRef.current
      ?.querySelector(`[data-index="${sel}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  }, [sel])

  const open = (i: number) => {
    const r = results[i]?.repo
    if (r && !r.error) navigate(repoLink(r.name, { kind: 'tree', path: '' }))
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
          filter ? (
            <Empty
              light
              title="No repository matches"
              description="Try a shorter or different name."
            />
          ) : (
            <Empty
              title="No repositories here yet"
              description="codeview shows the git repositories in the folder it was started with."
              link={{ href: GUIDE_URL, label: 'Setup guide' }}
            />
          )
        ) : (
          <div ref={listRef} className="flex flex-col gap-10">
            {repos.isPending ? (
              <ul className={GRID}>
                {Array.from({ length: 6 }, (_, i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: static placeholder tiles
                  <RepoTileSkeleton key={i} />
                ))}
              </ul>
            ) : (
              sections.map((s) => (
                <section key={s.group ?? ''} className="flex flex-col gap-4">
                  {s.label !== undefined && (
                    <OrgStrip
                      group={s.group ?? ''}
                      label={s.label}
                      repos={s.repos}
                    />
                  )}
                  {s.active.length > 0 && (
                    <ul className={GRID}>
                      {s.active.map(({ repo, name, positions }, j) => {
                        const i = s.offset + j
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
                  )}
                  {s.quiet.length > 0 && (
                    <QuietList
                      items={s.quiet}
                      total={s.quietTotal}
                      hidden={s.hidden}
                      expanded={expanded[s.group ?? ''] ?? false}
                      onToggle={() =>
                        setExpanded((e) => {
                          const key = s.group ?? ''
                          return { ...e, [key]: !(e[key] ?? false) }
                        })
                      }
                      offset={s.offset + s.active.length}
                      sel={sel}
                      onHover={setSel}
                      onLeave={() => setSel(null)}
                    />
                  )}
                </section>
              ))
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
          <PanelEmpty
            title="No commits yet"
            description="New commits across your repositories show up here."
          />
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
