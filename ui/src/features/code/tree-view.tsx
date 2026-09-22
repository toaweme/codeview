import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { FolderOpen, GitBranch, RotateCcwClock, Tag } from 'lucide-react'
import {
  logQuery,
  type ResolvedRef,
  reposQuery,
  treeQuery,
} from '@/api/queries'
import { Badge } from '@/components/badge'
import { Shortcut } from '@/components/shortcut'
import { ErrorState, Skeleton } from '@/features/shell/states'
import { MoreMenu } from '@/features/shell/top-line'
import { cn } from '@/lib/cn'
import { shortHash } from '@/lib/format'
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
        <div className="mx-auto w-full max-w-[860px] px-6 pt-4 pb-16">
          {!path && resolved && <RepoSummary repo={repo} resolved={resolved} />}
          {!resolved || tree.isPending ? (
            <Skeleton lines={12} className="px-0" />
          ) : tree.isError ? (
            <ErrorState error={tree.error} />
          ) : tree.data.readme ? null : (
            <NoReadme folder={!!path} count={tree.data.entries.length} />
          )}
        </div>
      </div>
    </>
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
  const log = useInfiniteQuery(logQuery(repo, resolved.rev, ''))
  const info = repos.data?.repos.find((r) => r.name === repo)
  const last = log.data?.pages[0]?.commits[0]
  const name = repo.slice(repo.indexOf('/') + 1)
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
