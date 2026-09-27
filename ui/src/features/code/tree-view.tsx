import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
  BookOpen,
  FolderOpen,
  GitBranch,
  RotateCcwClock,
  Tag,
} from 'lucide-react'
import { useMemo } from 'react'
import {
  logQuery,
  type ResolvedRef,
  refsQuery,
  repoActivityQuery,
  reposQuery,
  treeQuery,
} from '@/api/queries'
import type { Tree } from '@/api/types'
import { Badge } from '@/components/badge'
import { Markdown } from '@/components/markdown'
import { Shortcut } from '@/components/shortcut'
import {
  BranchRow,
  Panel,
  ReleaseRow,
  RowsSkeleton,
} from '@/features/repos/activity-panels'
import { buildReleases } from '@/features/repos/versions'
import { ErrorState, Skeleton } from '@/features/shell/states'
import { MoreMenu } from '@/features/shell/top-line'
import { cn } from '@/lib/cn'
import { shortHash } from '@/lib/format'
import { repoBase } from '@/lib/repo-name'
import { formatFull, relativeTime } from '@/lib/time'
import { repoLink } from '@/lib/url'
import { pathActions } from './path-actions'
import { PathBar, ViewToggles } from './path-bar'

export function TreeView({
  repo,
  resolved,
  path,
}: {
  repo: string
  resolved: ResolvedRef | null
  path: string
}) {
  const tree = useQuery({
    ...treeQuery(repo, resolved?.rev ?? '', path),
    enabled: !!resolved,
  })

  return (
    <>
      <PathBar repo={repo} resolved={resolved} path={path}>
        <ViewToggles
          repo={repo}
          resolved={resolved}
          path={path}
          active="code"
          file={false}
        />
        <MoreMenu items={pathActions(repo, resolved, { kind: 'tree', path })} />
      </PathBar>
      <div className="min-h-0 flex-1 overflow-auto">
        <div className="mx-auto w-full max-w-[860px] px-6 pt-6 pb-16">
          {!path && resolved && (
            <>
              <RepoSummary repo={repo} resolved={resolved} />
              <RepoRefs repo={repo} />
            </>
          )}
          {!resolved || tree.isPending ? (
            <Skeleton lines={12} className="px-0" />
          ) : tree.isError ? (
            <ErrorState error={tree.error} />
          ) : tree.data.readme ? (
            <Readme repo={repo} resolved={resolved} tree={tree.data} />
          ) : (
            <NoReadme folder={!!path} count={tree.data.entries.length} />
          )}
        </div>
      </div>
    </>
  )
}

function Readme({
  repo,
  resolved,
  tree,
}: {
  repo: string
  resolved: ResolvedRef
  tree: Tree
}) {
  const readme = tree.readme
  if (!readme) return null
  const ref = resolved.isDefault ? undefined : resolved.name
  const name = readme.path.slice(readme.path.lastIndexOf('/') + 1)
  return (
    <article>
      <div
        className={cn(
          'flex items-center rounded-lg',
          'mb-6 h-10 gap-2.5 pr-1.5 pl-3',
          'bg-island-muted text-muted-foreground text-sm',
        )}
      >
        <BookOpen className="size-4 shrink-0" aria-hidden />
        <span className="min-w-0 flex-1 truncate font-medium">{name}</span>
        <Link
          {...repoLink(repo, { kind: 'blob', ref, path: readme.path })}
          className={cn(
            'flex shrink-0 items-center rounded-md',
            'h-7 px-2.5',
            'whitespace-nowrap',
            'transition-colors duration-100 hover:bg-hover hover:text-foreground',
          )}
        >
          View file
        </Link>
      </div>
      <Markdown
        source={readme.content}
        html={readme.html}
        repo={repo}
        rev={resolved.rev}
        linkRef={ref}
      />
    </article>
  )
}

function NoReadme({ folder, count }: { folder: boolean; count: number }) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-20 text-center">
      <FolderOpen className="size-8 text-faint" aria-hidden />
      <p className="font-medium">
        {count === 0
          ? 'This folder is empty.'
          : folder
            ? 'This folder has no README.'
            : 'This repository has no README.'}
      </p>
      {count > 0 && (
        <p className="max-w-sm text-muted-foreground">
          Its {count} {count === 1 ? 'entry is' : 'entries are'} in the tree on
          the left. Press <Shortcut id="palette.files" /> to find any file.
        </p>
      )}
    </div>
  )
}

function RepoSummary({
  repo,
  resolved,
}: {
  repo: string
  resolved: ResolvedRef
}) {
  const repos = useQuery(reposQuery())
  const refs = useQuery(refsQuery(repo))
  const log = useInfiniteQuery(logQuery(repo, resolved.rev, ''))
  const info = repos.data?.repos.find((r) => r.name === repo)
  const last = log.data?.pages[0]?.commits[0]
  const name = repoBase(repo)
  const ref = resolved.isDefault ? undefined : resolved.name

  return (
    <section className="mb-8 rounded-xl bg-island-muted p-5">
      <h1 className="font-semibold text-2xl tracking-tight">{name}</h1>
      {info?.description && (
        <p className="mt-1.5 max-w-[70ch] text-muted-foreground">
          {info.description}
        </p>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Badge tone="primary">
          {resolved.kind === 'tag' ? (
            <Tag aria-hidden />
          ) : (
            <GitBranch aria-hidden />
          )}
          {resolved.kind === 'commit'
            ? shortHash(resolved.name)
            : resolved.name}
        </Badge>
        {resolved.isDefault && <Badge>default branch</Badge>}
        {refs.data && (
          <>
            <BadgeLink repo={repo} kind="branches">
              {refs.data.branches.length}{' '}
              {refs.data.branches.length === 1 ? 'branch' : 'branches'}
            </BadgeLink>
            <BadgeLink repo={repo} kind="releases">
              {refs.data.tags.length}{' '}
              {refs.data.tags.length === 1 ? 'tag' : 'tags'}
            </BadgeLink>
          </>
        )}
      </div>
      {last && (
        <div className="mt-4 flex items-center gap-3 rounded-lg bg-background py-2 pr-2 pl-3.5">
          <Link
            {...repoLink(repo, { kind: 'commit', hash: last.hash })}
            className="min-w-0 flex-1 truncate transition-colors duration-100 hover:text-primary"
            title={last.subject}
          >
            {last.subject}
          </Link>
          <span className="hidden shrink-0 text-muted-foreground text-sm sm:inline">
            {last.author.name}
          </span>
          <span
            className="shrink-0 text-faint text-sm"
            title={formatFull(last.author.date)}
          >
            {relativeTime(last.author.date)}
          </span>
          <Badge>{shortHash(last.hash)}</Badge>
          <Link
            {...repoLink(repo, { kind: 'commits', ref, path: '' })}
            className={cn(
              'flex shrink-0 items-center rounded-md',
              'h-8 gap-2 px-2.5',
              'whitespace-nowrap text-muted-foreground text-sm',
              'transition-colors duration-100 hover:bg-hover hover:text-foreground',
            )}
          >
            <RotateCcwClock className="size-4" aria-hidden />
            History
          </Link>
        </div>
      )}
    </section>
  )
}

function BadgeLink({
  repo,
  kind,
  children,
}: {
  repo: string
  kind: 'branches' | 'releases'
  children: React.ReactNode
}) {
  return (
    <Link
      {...repoLink(repo, { kind })}
      className="group rounded-md focus-visible:outline-2 focus-visible:outline-ring"
    >
      <Badge className="transition-colors duration-100 group-hover:bg-primary/12 group-hover:text-primary">
        {children}
      </Badge>
    </Link>
  )
}

const RECENT_BRANCHES = 5

function RepoRefs({ repo }: { repo: string }) {
  const refs = useQuery(refsQuery(repo))
  const hasBranches = !!refs.data && refs.data.branches.length > 1
  const activity = useQuery({
    ...repoActivityQuery(repo),
    enabled: hasBranches,
  })
  const release = useMemo(
    () =>
      refs.data
        ? buildReleases(repo, refs.data.tags).find((r) => r.isVersion)
        : undefined,
    [refs.data, repo],
  )
  if (!refs.data || (!release && !hasBranches)) return null
  const branches = activity.data?.branches.slice(0, RECENT_BRANCHES) ?? []
  return (
    <div className="mb-8 flex flex-col gap-6">
      {release && (
        <Panel
          title="Latest release"
          more={{
            link: repoLink(repo, { kind: 'releases' }),
            label: 'View all',
          }}
        >
          <ul>
            <ReleaseRow release={release} showRepo={false} />
          </ul>
        </Panel>
      )}
      {hasBranches && (
        <Panel
          title="Recent branches"
          more={{
            link: repoLink(repo, { kind: 'branches' }),
            label: 'View all',
          }}
        >
          {activity.isPending ? (
            <RowsSkeleton rows={3} />
          ) : activity.isError ? (
            <ErrorState error={activity.error} />
          ) : (
            <ul>
              {branches.map((b) => (
                <BranchRow
                  key={b.name}
                  branch={b}
                  base={refs.data.default}
                  showRepo={false}
                />
              ))}
            </ul>
          )}
        </Panel>
      )}
    </div>
  )
}
