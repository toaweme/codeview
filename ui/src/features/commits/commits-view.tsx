import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { FolderTree } from 'lucide-react'
import { useEffect, useMemo, useRef } from 'react'
import { logQuery, type ResolvedRef, treeQuery } from '@/api/queries'
import type { Commit } from '@/api/types'
import { Badge } from '@/components/badge'
import { CopyButton } from '@/components/copy-button'
import { Tooltip } from '@/components/tooltip'
import { historyActions } from '@/features/code/path-actions'
import { PathBar, ViewToggles } from '@/features/code/path-bar'
import { Empty, ErrorState } from '@/features/shell/states'
import { MoreMenu } from '@/features/shell/top-line'
import { cn } from '@/lib/cn'
import { shortHash } from '@/lib/format'
import { dayKey, formatDay, formatFull, relativeTime } from '@/lib/time'
import { repoLink } from '@/lib/url'
import { type AuthorCount, FilterBar, FilterPills } from './filter-bar'
import {
  apiParams,
  type DateRange,
  dateField,
  dateRange,
  type HistoryFilter,
  hasFilter,
  parseHistoryFilter,
  rangeLabel,
  widen,
} from './filters'
import { HistoryStrip } from './histogram'

export function CommitsView({
  repo,
  resolved,
  path,
}: {
  repo: string
  resolved: ResolvedRef | null
  path: string
}) {
  const search = useSearch({ from: '/$org/$' })
  const filter = useMemo(() => parseHistoryFilter(search), [search])
  const navigate = useNavigate({ from: '/$org/$' })
  // fixed for the life of the view so presets match the key the loader warmed
  const now = useMemo(() => new Date(), [])
  const range = dateRange(filter, now)
  const field = dateField(filter)
  const setFilter = (patch: Partial<HistoryFilter>) =>
    void navigate({
      search: (prev) => ({ ...prev, ...patch }),
      replace: true,
    })
  const setRange = (r: DateRange) =>
    setFilter({ range: undefined, since: r.since, until: r.until })

  const log = useInfiniteQuery({
    ...logQuery(repo, resolved?.rev ?? '', path, apiParams(filter, now)),
    enabled: !!resolved,
  })
  const sentinel = useRef<HTMLDivElement>(null)
  // the URL does not say file or folder, so ask the parent listing the sidebar likely cached
  const parent = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : ''
  const parentTree = useQuery({
    ...treeQuery(repo, resolved?.rev ?? '', parent),
    enabled: !!resolved && !!path,
  })
  const entry = parentTree.data?.entries.find((e) => e.path === path)
  const file = !!entry && entry.type !== 'tree'
  const known = !path || !!entry || parentTree.isError

  const groups = useMemo(() => {
    const out: { key: string; day: string; commits: Commit[] }[] = []
    for (const page of log.data?.pages ?? []) {
      for (const c of page.commits) {
        const when = c[field].date
        const k = dayKey(when)
        const last = out[out.length - 1]
        if (last && last.key === k) last.commits.push(c)
        else out.push({ key: k, day: formatDay(when), commits: [c] })
      }
    }
    return out
  }, [log.data, field])
  const partial = log.data?.pages.some((p) => p.partial) ?? false
  // an author filter would shrink the suggestions to one row
  const lastAuthors = useRef<AuthorCount[]>([])
  const authors = useMemo(() => {
    if (filter.author) return lastAuthors.current
    const seen = new Map<string, AuthorCount>()
    for (const page of log.data?.pages ?? [])
      for (const c of page.commits) {
        const a = seen.get(c.author.name)
        if (a) a.count++
        else
          seen.set(c.author.name, {
            name: c.author.name,
            email: c.author.email,
            count: 1,
          })
      }
    const out = [...seen.values()].sort((a, b) => b.count - a.count)
    lastAuthors.current = out
    return out
  }, [log.data, filter.author])

  const { hasNextPage, isFetchingNextPage, fetchNextPage } = log
  useEffect(() => {
    const el = sentinel.current
    if (!el || !hasNextPage) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !isFetchingNextPage)
          void fetchNextPage()
      },
      { rootMargin: '800px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  return (
    <>
      <PathBar repo={repo} resolved={resolved} path={path}>
        <ViewToggles
          repo={repo}
          resolved={resolved}
          path={path}
          active="history"
          file={known ? file : undefined}
        />
        <MoreMenu
          items={historyActions(repo, resolved, path, known ? file : undefined)}
        />
      </PathBar>
      <div className="shrink-0 px-4 pt-4">
        <div className="rounded-2xl bg-island-muted p-1.5">
          {/* fields inside the muted toolbar sit on the island color */}
          <div className="[--island-muted:var(--island)]">
            <FilterBar
              filter={filter}
              now={now}
              authors={authors}
              onChange={setFilter}
            />
            <FilterPills filter={filter} now={now} onChange={setFilter} />
            <HistoryStrip
              repo={repo}
              rev={resolved?.rev ?? ''}
              path={path}
              field={field}
              range={range}
              onPick={setRange}
            />
          </div>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <div className="px-4 pb-12">
          {partial && (
            <p className="px-2 pt-3 text-faint text-sm">
              Only the newest 20,000 commits were searched by author date, so
              older matches may be missing.{' '}
              <button
                type="button"
                onClick={() => setFilter({ date: 'committer' })}
                className={cn(
                  'rounded-sm',
                  'text-muted-foreground underline decoration-faint underline-offset-2',
                  'hover:text-foreground',
                )}
              >
                Match by committer date
              </button>{' '}
              to search the whole range.
            </p>
          )}
          {!resolved || log.isPending ? (
            <ListSkeleton />
          ) : log.isError ? (
            <ErrorState error={log.error} />
          ) : groups.length === 0 ? (
            <NoCommits
              filter={filter}
              range={range}
              now={now}
              onChange={setFilter}
            />
          ) : (
            groups.map((g) => (
              <section key={g.key}>
                <h2
                  className={cn(
                    'sticky z-[1] flex items-center',
                    'top-0 gap-2 px-1 pt-5 pb-1.5',
                    'bg-background font-semibold text-base',
                  )}
                >
                  <span className="whitespace-nowrap num">{g.day}</span>
                  <Badge>
                    {g.commits.length}{' '}
                    {g.commits.length === 1 ? 'commit' : 'commits'}
                  </Badge>
                </h2>
                <ul className="rounded-2xl bg-island-muted p-1.5">
                  {g.commits.map((c) => (
                    <CommitRow
                      key={c.hash}
                      repo={repo}
                      commit={c}
                      field={field}
                    />
                  ))}
                </ul>
              </section>
            ))
          )}
          <div ref={sentinel} />
          {isFetchingNextPage && <ListSkeleton rows={4} header={false} />}
        </div>
      </div>
    </>
  )
}

function ListSkeleton({
  rows = 12,
  header = true,
}: {
  rows?: number
  header?: boolean
}) {
  return (
    <div aria-hidden>
      {header && (
        <div className="flex items-center gap-2 px-1 pt-5 pb-1.5">
          <div className="h-3.5 w-24 animate-pulse rounded-md bg-muted" />
          <div className="h-(--badge-h) w-16 animate-pulse rounded-md bg-muted" />
        </div>
      )}
      <div
        className={cn('rounded-2xl bg-island-muted p-1.5', !header && 'mt-5')}
      >
        {Array.from({ length: rows }, (_, i) => (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: static placeholder rows
            key={i}
            className="flex h-(--row-h) items-center gap-4 px-2.5"
          >
            <div
              className="h-3.5 animate-pulse rounded-md bg-muted"
              style={{ width: `${30 + ((i * 37) % 40)}%` }}
            />
            <div className="ml-auto hidden h-3.5 w-28 animate-pulse rounded-md bg-muted sm:block" />
            <div className="h-3.5 w-20 animate-pulse rounded-md bg-muted" />
            <div className="h-(--badge-h) w-16 animate-pulse rounded-md bg-muted" />
            <div className="w-16" />
          </div>
        ))}
      </div>
    </div>
  )
}

function NoCommits({
  filter,
  range,
  now,
  onChange,
}: {
  filter: HistoryFilter
  range: DateRange
  now: Date
  onChange: (patch: Partial<HistoryFilter>) => void
}) {
  if (!hasFilter(filter)) return <Empty>No commits.</Empty>
  const dated = !!(range.since || range.until)
  const wider = dated ? widen(range, now) : null
  const btn = cn(
    'rounded-lg',
    'h-9 px-3',
    'whitespace-nowrap text-sm',
    'transition-colors duration-100 focus-visible:outline-2 focus-visible:outline-ring',
  )
  return (
    <div className="flex flex-col items-center gap-4 px-6 py-16 text-center">
      <p className="text-muted-foreground">
        {dated
          ? `No commits ${rangePhrase(range, now)}${filter.author || filter.grep ? ' match these filters' : ''}.`
          : 'No commits match these filters.'}
      </p>
      <div className="flex items-center gap-2">
        {wider && (wider.since || wider.until) && (
          <button
            type="button"
            onClick={() =>
              onChange({
                range: undefined,
                since: wider.since,
                until: wider.until,
              })
            }
            className={cn(
              btn,
              'bg-primary/12 font-medium text-primary hover:bg-primary/18',
            )}
          >
            Widen to {rangeLabel(wider, now)}
          </button>
        )}
        {dated && (
          <button
            type="button"
            onClick={() =>
              onChange({ range: undefined, since: undefined, until: undefined })
            }
            className={cn(
              btn,
              'bg-island-muted text-muted-foreground hover:bg-hover hover:text-foreground',
            )}
          >
            Any time
          </button>
        )}
        {(filter.author || filter.grep) && (
          <button
            type="button"
            onClick={() =>
              onChange({
                range: undefined,
                since: undefined,
                until: undefined,
                author: undefined,
                grep: undefined,
                date: undefined,
              })
            }
            className={cn(
              btn,
              'bg-island-muted text-muted-foreground hover:bg-hover hover:text-foreground',
            )}
          >
            Clear all filters
          </button>
        )}
      </div>
    </div>
  )
}

function rangePhrase(r: DateRange, now: Date): string {
  const label = rangeLabel(r, now)
  if (r.since && r.until)
    return r.since === r.until ? `on ${label}` : `from ${label}`
  return label.charAt(0).toLowerCase() + label.slice(1)
}

function CommitRow({
  repo,
  commit: c,
  field,
}: {
  repo: string
  commit: Commit
  field: 'author' | 'committer'
}) {
  const when = c[field].date
  return (
    <li
      className={cn(
        'group relative flex items-center rounded-lg',
        'h-(--row-h) gap-4 px-2.5',
        'transition-colors duration-75 hover:bg-hover',
      )}
    >
      <Link
        {...repoLink(repo, { kind: 'commit', hash: c.hash })}
        className="min-w-0 flex-1 truncate after:absolute after:inset-0 after:content-['']"
      >
        {c.subject}
      </Link>
      <span className="hidden w-40 shrink-0 truncate text-muted-foreground text-sm sm:block">
        {c.author.name}
      </span>
      <span
        className="w-28 shrink-0 truncate text-right text-faint text-sm"
        title={formatFull(when)}
      >
        {relativeTime(when)}
      </span>
      <span className="flex w-20 shrink-0 justify-end">
        <Badge>{shortHash(c.hash)}</Badge>
      </span>
      <span
        className={cn(
          'relative z-[1] flex shrink-0 items-center justify-end',
          'w-16',
          'opacity-0',
          'transition-opacity duration-100 focus-within:opacity-100 group-hover:opacity-100',
        )}
      >
        <CopyButton text={c.hash} title="Copy full hash" what="Hash" />
        <Tooltip label="Browse files at this commit">
          <Link
            {...repoLink(repo, { kind: 'tree', ref: c.hash, path: '' })}
            aria-label="Browse files at this commit"
            className={cn(
              'grid place-items-center rounded-md',
              'size-8',
              'text-muted-foreground',
              'transition-colors hover:bg-accent hover:text-foreground',
            )}
          >
            <FolderTree className="size-4" />
          </Link>
        </Tooltip>
      </span>
    </li>
  )
}
