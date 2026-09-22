import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Copy, FolderTree, GitCommitVertical, Link2 } from 'lucide-react'
import { commitQuery } from '@/api/queries'
import type { Commit } from '@/api/types'
import { Badge } from '@/components/badge'
import { CopyButton } from '@/components/copy-button'
import { repoCrumbs } from '@/features/code/path-actions'
import { DiffTopLine, DiffView } from '@/features/diff/diff-view'
import { ErrorState, Skeleton } from '@/features/shell/states'
import type { MenuItem } from '@/features/shell/top-line'
import { copyText } from '@/lib/clipboard'
import { cn } from '@/lib/cn'
import { shortHash } from '@/lib/format'
import { formatFull, relativeTime } from '@/lib/time'
import { repoLink } from '@/lib/url'

export function CommitPage({ repo, hash }: { repo: string; hash: string }) {
  const q = useQuery(commitQuery(repo, hash))
  const crumbs = [
    ...repoCrumbs(repo),
    { key: 'commit', label: `commit ${shortHash(hash)}` },
  ]
  if (q.isPending || q.isError)
    return (
      <>
        <DiffTopLine crumbs={crumbs} actions={commitActions(repo, hash, [])} />
        {q.isPending ? <Skeleton lines={16} /> : <ErrorState error={q.error} />}
      </>
    )
  const c = q.data.commit
  return (
    <DiffView
      key={c.hash}
      repo={repo}
      files={q.data.files}
      viewKey={c.hash}
      newRev={c.hash}
      oldRev={c.parents[0]}
      header={<CommitHeader repo={repo} commit={c} />}
      crumbs={crumbs}
      actions={commitActions(repo, c.hash, c.parents)}
    />
  )
}

function commitActions(
  repo: string,
  hash: string,
  parents: string[],
): MenuItem[] {
  return [
    {
      key: 'copy-hash',
      label: 'Copy full hash',
      icon: Copy,
      run: () => void copyText(hash, 'Hash'),
    },
    {
      key: 'copy-link',
      label: 'Copy link',
      icon: Link2,
      run: () => void copyText(window.location.href, 'Link'),
    },
    {
      key: 'browse',
      label: 'Browse files at this commit',
      icon: FolderTree,
      link: repoLink(repo, { kind: 'tree', ref: hash, path: '' }),
    },
    ...parents.map((p, i) => ({
      key: `parent-${p}`,
      label:
        parents.length === 1
          ? `Open parent ${shortHash(p)}`
          : `Open parent ${i + 1} ${shortHash(p)}`,
      icon: GitCommitVertical,
      link: repoLink(repo, { kind: 'commit', hash: p }),
    })),
  ]
}

export function CommitHeader({
  repo,
  commit: c,
}: {
  repo: string
  commit: Commit
}) {
  const coAuthored = c.committer.name !== c.author.name
  return (
    <div className="max-w-5xl px-6 pt-4 pb-6">
      <h1 className="font-semibold text-xl tracking-tight">{c.subject}</h1>
      {c.body.trim() && (
        <pre
          className={cn(
            'mt-3 max-w-[80ch]',
            'whitespace-pre-wrap break-words',
            'font-sans text-base text-muted-foreground leading-relaxed',
          )}
        >
          {c.body.trim()}
        </pre>
      )}
      <div
        className={cn(
          'flex flex-wrap items-center rounded-xl',
          'mt-4 gap-x-6 gap-y-2 px-4 py-3',
          'bg-island-muted text-muted-foreground text-sm',
        )}
      >
        <span>
          <span className="font-medium text-foreground">{c.author.name}</span>{' '}
          <span title={formatFull(c.author.date)}>
            {relativeTime(c.author.date)}
          </span>
        </span>
        {coAuthored && (
          <span>
            committed by{' '}
            <span className="font-medium text-foreground">
              {c.committer.name}
            </span>{' '}
            <span title={formatFull(c.committer.date)}>
              {relativeTime(c.committer.date)}
            </span>
          </span>
        )}
        {c.parents.length > 0 && (
          <span className="flex items-center gap-1.5">
            {c.parents.length === 1 ? 'parent' : 'parents'}
            {c.parents.map((p) => (
              <Link
                key={p}
                {...repoLink(repo, { kind: 'commit', hash: p })}
                className="rounded-md transition-opacity duration-100 hover:opacity-75"
              >
                <Badge>{shortHash(p)}</Badge>
              </Link>
            ))}
          </span>
        )}
        <span className="flex items-center gap-1.5">
          commit
          <Badge tone="primary">{shortHash(c.hash)}</Badge>
          <CopyButton text={c.hash} title="Copy full hash" what="Hash" />
        </span>
        <Link
          {...repoLink(repo, { kind: 'tree', ref: c.hash, path: '' })}
          className={cn(
            'flex shrink-0 items-center rounded-lg',
            'ml-auto h-8 gap-2 px-3',
            'whitespace-nowrap bg-background font-medium text-foreground text-sm',
            'transition-colors duration-100 hover:bg-hover',
          )}
        >
          <FolderTree className="size-4" aria-hidden />
          Browse files
        </Link>
      </div>
    </div>
  )
}
