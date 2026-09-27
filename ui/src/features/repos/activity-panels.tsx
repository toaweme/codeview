import { Link } from '@tanstack/react-router'
import {
  ArrowDown,
  ArrowUp,
  ChevronRight,
  FolderGit2,
  GitBranch,
  Tag,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { ActivityBranch, ActivityCommit } from '@/api/types'
import { Badge } from '@/components/badge'
import { Combobox } from '@/components/combobox'
import { Tooltip } from '@/components/tooltip'
import { cn } from '@/lib/cn'
import { shortHash } from '@/lib/format'
import { usePressPreload } from '@/lib/preload'
import { repoBase, repoParent } from '@/lib/repo-name'
import { dayKey, formatDay, formatFull, relativeTime } from '@/lib/time'
import { repoLink } from '@/lib/url'
import { releaseLink, shortRepo } from './activity-links'
import { aheadLabel, type BranchGroups, behindLabel } from './branch-groups'
import type { overviewLink } from './overview-nav'
import { useRepoNames } from './use-repo-names'
import { isBotBranch, type Release, type ReleaseGroup } from './versions'

const ROW = [
  'group relative flex h-(--row-h) min-w-0 items-center gap-3',
  'rounded-lg px-2.5 transition-colors duration-75 hover:bg-hover',
].join(' ')
const OVERLAY = [
  'min-w-0 flex-1 outline-none',
  "after:absolute after:inset-0 after:rounded-lg after:content-['']",
  'focus-visible:after:outline-2 focus-visible:after:outline-ring',
].join(' ')

type PanelLink = ReturnType<typeof overviewLink> | ReturnType<typeof repoLink>

export function Panel({
  title,
  more,
  children,
}: {
  title: string
  more?: { link: PanelLink; label: string }
  children: React.ReactNode
}) {
  return (
    <section className="min-w-0">
      <div className="flex h-8 items-center gap-3 px-1 pb-1.5">
        <h2 className="min-w-0 flex-1 truncate font-semibold text-base">
          {title}
        </h2>
        {more && (
          <Link {...more.link} className={TEXT_LINK}>
            {more.label}
          </Link>
        )}
      </div>
      <div className="rounded-2xl bg-island-muted p-1.5">{children}</div>
    </section>
  )
}

// TEXT_LINK styles the quiet links beside section titles.
export const TEXT_LINK = cn(
  'shrink-0 whitespace-nowrap rounded-md px-2 py-1',
  'text-muted-foreground text-sm transition-colors duration-100',
  'hover:bg-hover hover:text-foreground',
  'focus-visible:outline-2 focus-visible:outline-ring',
)

export function PanelEmpty({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-2.5 py-6 text-center text-muted-foreground text-sm">
      {children}
    </p>
  )
}

export function RowsSkeleton({ rows }: { rows: number }) {
  return (
    <div aria-hidden>
      {Array.from({ length: rows }, (_, i) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: static placeholder rows
          key={i}
          className="flex h-(--row-h) items-center gap-3 px-2.5"
        >
          <div className="h-3.5 w-16 animate-pulse rounded-md bg-muted" />
          <div
            className="h-3.5 animate-pulse rounded-md bg-muted"
            style={{ width: `${35 + ((i * 29) % 40)}%` }}
          />
        </div>
      ))}
    </div>
  )
}

function RepoBadge({ repo, org }: { repo: string; org?: string }) {
  const names = useRepoNames()
  return (
    <Badge className="max-w-48 min-w-0">
      <span className="truncate">{shortRepo(repo, org, names.display)}</span>
    </Badge>
  )
}

const clockFmt = new Intl.DateTimeFormat('en', {
  hour: '2-digit',
  minute: '2-digit',
})

function Clock({ iso }: { iso: string }) {
  const t = Date.parse(iso)
  return (
    <span
      className="num hidden shrink-0 text-faint text-sm sm:block"
      title={formatFull(iso)}
    >
      {Number.isNaN(t) ? '' : clockFmt.format(t)}
    </span>
  )
}

function When({ iso }: { iso: string }) {
  return (
    <span
      className="num hidden w-28 shrink-0 truncate text-right text-faint text-sm sm:block"
      title={formatFull(iso)}
    >
      {relativeTime(iso)}
    </span>
  )
}

export function CommitFeed({
  commits,
  org,
  sticky,
  showRepo = true,
}: {
  commits: ActivityCommit[]
  org?: string
  sticky?: boolean
  showRepo?: boolean
}) {
  const preload = usePressPreload()
  const groups = useMemo(() => {
    const out: { key: string; day: string; commits: ActivityCommit[] }[] = []
    for (const c of commits) {
      const k = dayKey(c.committed_at)
      const last = out[out.length - 1]
      if (last && last.key === k) last.commits.push(c)
      else out.push({ key: k, day: formatDay(c.committed_at), commits: [c] })
    }
    return out
  }, [commits])
  return groups.map((g) => (
    <section key={g.key}>
      <h3
        className={cn(
          'flex h-9 items-end px-2.5 pb-1 font-medium text-faint text-sm',
          sticky && 'sticky top-0 z-[2] rounded-lg bg-island-muted',
        )}
      >
        {g.day}
        <span className="num pl-2 font-normal">{g.commits.length}</span>
      </h3>
      <ul>
        {g.commits.map((c) => {
          const link = repoLink(c.repo, { kind: 'commit', hash: c.hash })
          return (
            <li key={`${c.repo}@${c.hash}`} className={ROW}>
              {showRepo && <RepoBadge repo={c.repo} org={org} />}
              <Link
                {...link}
                {...preload(link)}
                className={cn(OVERLAY, 'truncate')}
              >
                {c.subject}
              </Link>
              <span className="hidden max-w-36 shrink-0 truncate text-muted-foreground text-sm md:block">
                {c.author.name}
              </span>
              <Clock iso={c.committed_at} />
              <Badge className="w-[4.75rem] justify-center">
                {shortHash(c.hash)}
              </Badge>
            </li>
          )
        })}
      </ul>
    </section>
  ))
}

export function TagLabel({
  release,
  className,
}: {
  release: Pick<Release, 'prefix' | 'version' | 'isVersion'>
  className?: string
}) {
  return (
    <span className={cn('flex min-w-0 items-baseline', className)}>
      {release.prefix && (
        <span className="min-w-0 truncate text-faint">{release.prefix}/</span>
      )}
      <span
        className={cn(
          'font-medium text-foreground',
          release.isVersion ? 'shrink-0' : 'min-w-0 truncate',
        )}
      >
        {release.version}
      </span>
    </span>
  )
}

export function ReleaseRow({
  release: r,
  org,
  showRepo,
}: {
  release: Release
  org?: string
  showRepo: boolean
}) {
  const preload = usePressPreload()
  const link = releaseLink(r)
  const prev = r.previous
    ? r.previous.slice(r.prefix ? r.prefix.length + 1 : 0)
    : ''
  return (
    <li className={ROW}>
      <Tag
        className={cn(
          'size-4 shrink-0',
          r.isVersion ? 'text-info' : 'text-faint',
        )}
        aria-hidden
      />
      <Link
        {...link}
        {...preload(link)}
        className={cn(OVERLAY, 'flex items-baseline gap-2 overflow-hidden')}
      >
        <TagLabel release={r} className="shrink" />
        {prev && (
          <span className="hidden min-w-0 shrink-[2] truncate text-faint text-sm md:block">
            since {prev}
          </span>
        )}
      </Link>
      {showRepo && <RepoBadge repo={r.repo} org={org} />}
      <When iso={r.taggedAt} />
    </li>
  )
}

export function BranchRow({
  branch: b,
  base,
  org,
  showRepo,
  dim,
}: {
  branch: ActivityBranch
  base?: string
  org?: string
  showRepo: boolean
  dim?: boolean
}) {
  const preload = usePressPreload()
  const link = base
    ? repoLink(b.repo, { kind: 'compare', base, head: b.name })
    : repoLink(b.repo, { kind: 'tree', ref: b.name, path: '' })
  const quiet = dim || isBotBranch(b.name)
  return (
    <li className={cn(ROW, quiet && 'text-muted-foreground')}>
      <GitBranch className="size-4 shrink-0 text-faint" aria-hidden />
      <Link
        {...link}
        {...preload(link)}
        className={cn(OVERLAY, 'flex items-baseline gap-3 overflow-hidden')}
      >
        <span
          className={cn(
            'max-w-[50%] shrink-0 truncate',
            !quiet && 'font-medium text-foreground',
          )}
        >
          {b.name}
        </span>
        <span className="min-w-0 truncate text-muted-foreground text-sm">
          {b.subject}
        </span>
      </Link>
      {showRepo && <RepoBadge repo={b.repo} org={org} />}
      <span className="relative z-[1] flex shrink-0 gap-1">
        <Tooltip label={aheadLabel(b.ahead, base)}>
          <span className="flex">
            <Badge tone={b.ahead > 0 && !dim ? 'add' : 'neutral'}>
              <ArrowUp aria-hidden />
              {b.ahead.toLocaleString()}
              <span className="sr-only">{aheadLabel(b.ahead, base)}</span>
            </Badge>
          </span>
        </Tooltip>
        <Tooltip label={behindLabel(b.behind, base)}>
          <span className="flex">
            <Badge tone={b.behind > 0 && !dim ? 'warn' : 'neutral'}>
              <ArrowDown aria-hidden />
              {b.behind.toLocaleString()}
              <span className="sr-only">{behindLabel(b.behind, base)}</span>
            </Badge>
          </span>
        </Tooltip>
      </span>
      <When iso={b.updated_at} />
    </li>
  )
}

function GroupTitle({ title, count }: { title: string; count: number }) {
  return (
    <h3 className="flex h-9 items-end px-2.5 pb-1 font-medium text-faint text-sm">
      {title}
      <span className="num pl-2 font-normal">{count}</span>
    </h3>
  )
}

export function BranchList({
  groups: { people, bots, merged },
  base,
  org,
  showRepo,
}: {
  groups: BranchGroups
  base: (b: ActivityBranch) => string | undefined
  org?: string
  showRepo: boolean
}) {
  const [showMerged, setShowMerged] = useState(false)
  const rows = (list: ActivityBranch[], dim = false) => (
    <ul>
      {list.map((b) => (
        <BranchRow
          key={`${b.repo}@${b.name}`}
          branch={b}
          base={base(b)}
          org={org}
          showRepo={showRepo}
          dim={dim}
        />
      ))}
    </ul>
  )
  return (
    <>
      {rows(people)}
      {bots.length > 0 && (
        <section>
          <GroupTitle title="Bot branches" count={bots.length} />
          {rows(bots)}
        </section>
      )}
      {merged.length > 0 && (
        <section>
          <h3>
            <button
              type="button"
              aria-expanded={showMerged}
              onClick={() => setShowMerged((o) => !o)}
              className={cn(
                'flex h-9 w-full items-end rounded-lg px-2.5 pb-1',
                'font-medium text-faint text-sm transition-colors duration-100',
                'hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring',
              )}
            >
              <span className="flex items-center gap-1 leading-5">
                <ChevronRight
                  className={cn(
                    'size-4 shrink-0 transition-transform duration-100',
                    showMerged && 'rotate-90',
                  )}
                  aria-hidden
                />
                Merged
                <span className="num pl-1 font-normal">{merged.length}</span>
              </span>
            </button>
          </h3>
          {showMerged && rows(merged, true)}
        </section>
      )}
    </>
  )
}

export function ReleaseList({
  groups,
  org,
  showRepo,
}: {
  groups: ReleaseGroup[]
  org?: string
  showRepo: boolean
}) {
  return groups.map((g) => (
    <section key={g.key}>
      <h3
        className={cn(
          'sticky top-0 z-[2] flex h-9 items-end rounded-lg',
          'bg-island-muted px-2.5 pb-1 font-medium text-faint text-sm',
        )}
      >
        <span className="truncate">{g.title}</span>
        <span className="num shrink-0 pl-2 font-normal">
          {g.releases.length}
        </span>
      </h3>
      <ul>
        {g.releases.map((r) => (
          <ReleaseRow
            key={`${r.repo}@${r.name}`}
            release={r}
            org={org}
            showRepo={showRepo}
          />
        ))}
      </ul>
    </section>
  ))
}

export function RepoFilter({
  repos,
  org,
  selected,
  onChange,
  counts,
}: {
  repos: string[]
  org?: string
  selected: readonly string[]
  onChange: (next: string[]) => void
  counts?: ReadonlyMap<string, number>
}) {
  const names = useRepoNames()
  const options = useMemo(() => {
    const parents = new Set(repos.map(repoParent))
    const grouped = parents.size > 1
    return repos
      .toSorted((a, b) => a.localeCompare(b))
      .map((r) => {
        const n = counts?.get(r)
        return {
          value: r,
          label: grouped ? repoBase(r) : shortRepo(r, org, names.display),
          group: grouped
            ? shortRepo(repoParent(r), org, names.display) || 'Ungrouped'
            : undefined,
          keywords: [r],
          detail: n === undefined ? undefined : n.toLocaleString(),
        }
      })
  }, [repos, org, counts, names])
  const picked = selected.filter((r) => repos.includes(r))
  if (repos.length < 2) return null
  return (
    <Combobox
      multiple
      icon={FolderGit2}
      label="Repositories"
      placeholder="Filter repositories"
      all="All repositories"
      count={(n) => `${n.toLocaleString()} repositories`}
      value={picked}
      onChange={onChange}
      options={options}
      empty="No repository matches."
      className="w-52 min-w-32 shrink"
    />
  )
}

export function FilterBar({
  children,
  count,
}: {
  children: React.ReactNode
  count?: React.ReactNode
}) {
  return (
    <div className="flex h-9 min-w-0 items-center gap-2">
      {children}
      {count !== undefined && (
        <span className="num ml-auto shrink-0 whitespace-nowrap pl-2 text-faint text-sm">
          {count}
        </span>
      )}
    </div>
  )
}

export function MoreSentinel({
  onMore,
  loading,
  auto,
}: {
  onMore: () => void
  loading: boolean
  auto: boolean
}) {
  const ref = useRef<HTMLButtonElement>(null)
  const more = useRef(onMore)
  more.current = onMore
  useEffect(() => {
    const el = ref.current
    if (!el || !auto || loading) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) more.current()
      },
      { rootMargin: '400px 0px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [auto, loading])
  return (
    <button
      ref={ref}
      type="button"
      onClick={onMore}
      disabled={loading}
      className={cn(
        'flex h-(--row-h) w-full items-center justify-center rounded-lg',
        'text-muted-foreground text-sm transition-colors duration-75',
        'hover:bg-hover hover:text-foreground',
        'disabled:cursor-default disabled:hover:bg-transparent',
      )}
    >
      {loading ? 'Loading' : 'Load more'}
    </button>
  )
}
