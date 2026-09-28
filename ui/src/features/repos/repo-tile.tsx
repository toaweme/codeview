import { Link } from '@tanstack/react-router'
import { GitBranch, Tag } from 'lucide-react'
import type { Repo } from '@/api/types'
import { Badge } from '@/components/badge'
import { Highlighted } from '@/components/highlighted'
import { Tooltip } from '@/components/tooltip'
import { cn } from '@/lib/cn'
import { usePressPreload } from '@/lib/preload'
import { formatFull, relativeTime } from '@/lib/time'
import { repoLink } from '@/lib/url'
import { RepoGlyph } from './repo-glyph'
import { Sparkline } from './sparkline'

const TILE = 'rounded-2xl bg-island-muted p-4'

// the translucent hover token would replace the fill and wash the tile out
export const RAISED =
  'bg-[color-mix(in_oklab,var(--foreground)_4.5%,var(--island-muted))]'

export function RepoTile({
  repo,
  name,
  positions,
  index,
  selected,
  onHover,
  onLeave,
}: {
  repo: Repo
  name: string
  positions: number[]
  index: number
  selected: boolean
  onHover: () => void
  onLeave: () => void
}) {
  const preload = usePressPreload()
  const home = repoLink(repo.name, { kind: 'tree', path: '' })
  const tag = repo.latest_tag
  const tagLink = tag
    ? repoLink(repo.name, { kind: 'tree', ref: tag.name, path: '' })
    : undefined
  const c = repo.last_commit
  return (
    <li
      data-index={index}
      className={cn(
        TILE,
        'relative flex flex-col gap-3 transition-colors duration-75',
        selected && RAISED,
      )}
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
    >
      <div className="flex items-start gap-3">
        <RepoGlyph name={repo.name} className="mt-0.5" />
        <div className="min-w-0 flex-1">
          <Link
            {...home}
            {...preload(home)}
            className={cn(
              'block truncate font-semibold text-lg tracking-tight outline-none',
              "after:absolute after:inset-0 after:rounded-2xl after:content-['']",
              'focus-visible:after:outline-2 focus-visible:after:outline-ring',
            )}
          >
            <Highlighted text={name} positions={positions} />
          </Link>
          {repo.description && (
            <p className="truncate text-muted-foreground text-sm">
              {repo.description}
            </p>
          )}
        </div>
        <Sparkline weeks={repo.activity} />
      </div>
      <div className="h-[42px] min-w-0">
        {c ? (
          <>
            <p className="truncate">{c.subject}</p>
            <p className="flex min-w-0 gap-2 text-faint text-sm">
              <span className="truncate">{c.author.name}</span>
              <span
                className="shrink-0 whitespace-nowrap"
                title={formatFull(c.author.date)}
              >
                {relativeTime(c.author.date)}
              </span>
            </p>
          </>
        ) : (
          <p className="text-faint">No commits yet.</p>
        )}
      </div>
      <div className="flex h-(--badge-h) min-w-0 items-center gap-1.5">
        {repo.default_branch && (
          <Badge tone="primary" className="min-w-0">
            <GitBranch aria-hidden />
            <span className="truncate">{repo.default_branch}</span>
          </Badge>
        )}
        {tag && tagLink && (
          <Tooltip label={`Tagged ${formatFull(tag.tagged_at)}`}>
            <Link
              {...tagLink}
              {...preload(tagLink)}
              className="relative z-[1] flex shrink-0 rounded-md outline-none focus-visible:outline-2 focus-visible:outline-ring"
            >
              <Badge tone="info" className="hover:bg-info/22">
                <Tag aria-hidden />
                <span>{tag.name}</span>
                <span className="whitespace-nowrap font-normal opacity-75">
                  {relativeTime(tag.tagged_at)}
                </span>
              </Badge>
            </Link>
          </Tooltip>
        )}
        <span className="num ml-auto shrink-0 whitespace-nowrap pl-2 text-faint text-xs">
          {repo.branch_count} {repo.branch_count === 1 ? 'branch' : 'branches'}
          <span className="pl-2">
            {repo.tag_count} {repo.tag_count === 1 ? 'tag' : 'tags'}
          </span>
        </span>
      </div>
    </li>
  )
}

export function RepoTileSkeleton() {
  return (
    <li className={cn(TILE, 'flex flex-col gap-3')} aria-hidden>
      <div className="flex items-start gap-3">
        <div className="mt-0.5 size-9 shrink-0 animate-pulse rounded-xl bg-muted" />
        <div className="min-w-0 flex-1">
          <div className="flex h-6 items-center">
            <div className="h-4 w-2/5 animate-pulse rounded-md bg-muted" />
          </div>
        </div>
        <div className="h-5 w-24 animate-pulse rounded-md bg-muted" />
      </div>
      <div className="flex h-[42px] flex-col justify-around">
        <div className="h-3.5 w-4/5 animate-pulse rounded-md bg-muted" />
        <div className="h-3 w-1/3 animate-pulse rounded-md bg-muted" />
      </div>
      <div className="h-(--badge-h) w-1/2 animate-pulse rounded-md bg-muted" />
    </li>
  )
}
