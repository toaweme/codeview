import { useQuery } from '@tanstack/react-query'
import { FolderOpen, GitBranch, Tag } from 'lucide-react'
import { type ResolvedRef, reposQuery, treeQuery } from '@/api/queries'
import { Badge } from '@/components/badge'
import { Shortcut } from '@/components/shortcut'
import { ErrorState, Skeleton } from '@/features/shell/states'
import { MoreMenu } from '@/features/shell/top-line'
import { shortHash } from '@/lib/format'
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
  const info = repos.data?.repos.find((r) => r.name === repo)
  const name = repo.slice(repo.indexOf('/') + 1)

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
    </section>
  )
}
