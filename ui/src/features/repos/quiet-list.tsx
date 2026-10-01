import { Link } from '@tanstack/react-router'
import { TriangleAlert } from 'lucide-react'
import type { Repo } from '@/api/types'
import { Highlighted } from '@/components/highlighted'
import { cn } from '@/lib/cn'
import { usePressPreload } from '@/lib/preload'
import { formatFull, relativeTime } from '@/lib/time'
import { repoLink } from '@/lib/url'
import { TEXT_LINK } from './activity-panels'
import { RepoGlyph } from './repo-glyph'
import { RAISED } from './repo-tile'
import { UNREADABLE, unreadableTitle } from './unreadable'

// QuietList is the compact list of repositories without recent commits.
export function QuietList({
  items,
  total,
  hidden,
  expanded,
  onToggle,
  offset,
  sel,
  onHover,
  onLeave,
}: {
  items: { repo: Repo; name: string; positions: number[] }[]
  total: number
  hidden: number
  expanded: boolean
  onToggle: () => void
  offset: number
  sel: number | null
  onHover: (i: number) => void
  onLeave: () => void
}) {
  const preload = usePressPreload()
  return (
    <div className="flex flex-col gap-2">
      <div className="flex h-7 items-center gap-2">
        <h3 className="num text-faint text-sm">{total} inactive</h3>
        {(hidden > 0 || expanded) && (
          <button
            type="button"
            aria-expanded={expanded}
            onClick={onToggle}
            className={cn(TEXT_LINK, 'ml-auto')}
          >
            {expanded ? 'Show fewer' : `Show all ${total}`}
          </button>
        )}
      </div>
      <ul className="flex flex-col rounded-2xl bg-island-muted p-1.5">
        {items.map(({ repo, name, positions }, j) => {
          const i = offset + j
          const home = repoLink(repo.name, { kind: 'tree', path: '' })
          const c = repo.last_commit
          const broken = unreadableTitle(repo)
          if (broken)
            return (
              <li
                key={repo.name}
                data-index={i}
                title={broken}
                onMouseEnter={() => onHover(i)}
                onMouseLeave={onLeave}
                className={cn(
                  'flex h-12 min-w-0 items-center gap-3 rounded-xl px-2.5',
                  i === sel && RAISED,
                )}
              >
                <RepoGlyph name={repo.name} size="row" />
                <span className="w-32 shrink-0 truncate font-medium text-muted-foreground sm:w-44">
                  <Highlighted text={name} positions={positions} />
                </span>
                <span className="flex min-w-0 flex-1 items-center gap-1.5 truncate text-del">
                  <TriangleAlert className="size-4 shrink-0" aria-hidden />
                  {UNREADABLE}
                </span>
              </li>
            )
          return (
            <li
              key={repo.name}
              data-index={i}
              onMouseEnter={() => onHover(i)}
              onMouseLeave={onLeave}
            >
              <Link
                {...home}
                {...preload(home)}
                className={cn(
                  'flex h-12 min-w-0 items-center gap-3 rounded-xl px-2.5',
                  'outline-none transition-colors duration-75',
                  'focus-visible:outline-2 focus-visible:outline-ring',
                  i === sel && RAISED,
                )}
              >
                <RepoGlyph name={repo.name} size="row" />
                <span className="w-32 shrink-0 truncate font-medium sm:w-44">
                  <Highlighted text={name} positions={positions} />
                </span>
                <span className="min-w-0 flex-1 truncate text-muted-foreground">
                  {c ? c.subject : 'No commits yet.'}
                </span>
                {repo.default_branch && (
                  <span className="hidden max-w-32 shrink-0 truncate text-faint text-sm sm:block">
                    {repo.default_branch}
                  </span>
                )}
                {c && (
                  <span
                    className="num w-20 shrink-0 whitespace-nowrap text-right text-faint text-sm"
                    title={formatFull(c.author.date)}
                  >
                    {relativeTime(c.author.date)}
                  </span>
                )}
              </Link>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
