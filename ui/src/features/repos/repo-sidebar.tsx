import { Link } from '@tanstack/react-router'
import { ChevronRight, TriangleAlert } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { Repo } from '@/api/types'
import { Badge } from '@/components/badge'
import { cn } from '@/lib/cn'
import { groupRepos, repoBase, repoParent } from '@/lib/repo-name'
import { groupLink, repoLink } from '@/lib/url'
import { usePersistedState } from '@/lib/use-persisted-state'
import { loadRecents, pruneRecents } from './recents'
import { RepoGlyph } from './repo-glyph'
import { isFresh, type OrgTone, orgTone, rankRepos } from './sidebar-rank'
import { UNREADABLE, unreadableTitle } from './unreadable'
import { useRepoNames } from './use-repo-names'

const DOT: Record<OrgTone, string> = {
  'org-1': 'bg-org-1',
  'org-2': 'bg-org-2',
  'org-3': 'bg-org-3',
  'org-4': 'bg-org-4',
  'org-5': 'bg-org-5',
  'org-6': 'bg-org-6',
}

const heading = cn(
  'flex h-8 items-center gap-2 rounded-lg px-2.5',
  'font-medium text-faint text-sm',
)

export function RepoSidebar({ repos, org }: { repos: Repo[]; org?: string }) {
  const names = useRepoNames()
  const [collapsed, setCollapsed] = usePersistedState<Record<string, boolean>>(
    'sidebar:orgs-collapsed',
    {},
  )
  const [recents] = useState(loadRecents)
  const now = useMemo(() => Date.now(), [])

  const groups = useMemo(
    () =>
      groupRepos(repos).map((g) => ({
        parent: g.parent,
        ...rankRepos(g.repos),
      })),
    [repos],
  )
  const recent = useMemo(() => {
    const by = new Map(repos.map((r) => [r.name, r]))
    return pruneRecents(recents, new Set(by.keys())).map(
      (n) => by.get(n) as Repo,
    )
  }, [recents, repos])

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto px-2 pt-2 pb-3">
      {recent.length > 0 && (
        <section>
          <p className={heading}>Recent</p>
          {recent.map((r) => (
            <RepoRow
              key={r.name}
              repo={r}
              now={now}
              label={
                <>
                  <RepoGlyph name={r.name} size="sm" />
                  <span className="truncate">{repoBase(r.name)}</span>
                  {repoParent(r.name) && (
                    <span className="truncate text-faint text-sm">
                      {names.display(repoParent(r.name))}
                    </span>
                  )}
                </>
              }
            />
          ))}
        </section>
      )}
      {groups.map(({ parent, active, quiet }) => {
        const shut = collapsed[parent] ?? false
        const count = active.length + quiet.length
        return (
          <section key={parent}>
            <div className="flex items-center gap-1">
              <button
                type="button"
                aria-expanded={!shut}
                aria-label={shut ? 'Expand group' : 'Collapse group'}
                onClick={() => setCollapsed((c) => ({ ...c, [parent]: !shut }))}
                className={cn(
                  'grid size-8 shrink-0 place-items-center rounded-lg text-faint',
                  'transition-colors duration-75 hover:bg-hover hover:text-foreground',
                )}
              >
                <ChevronRight
                  className={cn(
                    'size-4 transition-transform duration-100',
                    !shut && 'rotate-90',
                  )}
                />
              </button>
              {parent ? (
                <Link
                  {...groupLink(parent)}
                  className={cn(
                    heading,
                    'min-w-0 flex-1 pl-1 transition-colors duration-75',
                    'hover:text-foreground',
                    parent === org && 'text-foreground',
                  )}
                >
                  <OrgDot org={parent} />
                  <span className="truncate">{names.display(parent)}</span>
                  <Badge className="ml-auto">{count}</Badge>
                </Link>
              ) : (
                <p className={cn(heading, 'min-w-0 flex-1 pl-1')}>
                  <OrgDot org="" />
                  <span className="truncate">Ungrouped</span>
                  <Badge className="ml-auto">{count}</Badge>
                </p>
              )}
            </div>
            {!shut && <GroupBody active={active} quiet={quiet} now={now} />}
          </section>
        )
      })}
    </div>
  )
}

function GroupBody({
  active,
  quiet,
  now,
}: {
  active: Repo[]
  quiet: Repo[]
  now: number
}) {
  const [open, setOpen] = useState(false)
  // a group with nothing active has nothing to rank above its quiet repos
  const showQuiet = open || active.length === 0
  return (
    <>
      {active.map((r) => (
        <RepoRow key={r.name} repo={r} now={now} />
      ))}
      {quiet.length > 0 && active.length > 0 && (
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className={cn(
            'flex h-(--row-h) w-full items-center gap-2 rounded-lg px-2.5 pointer-coarse:h-11',
            'text-faint text-sm transition-colors duration-75',
            'hover:bg-hover hover:text-foreground',
          )}
        >
          <ChevronRight
            className={cn(
              'size-3.5 transition-transform duration-100',
              open && 'rotate-90',
            )}
          />
          {open ? 'Hide inactive' : `${quiet.length} inactive`}
        </button>
      )}
      {showQuiet &&
        quiet.map((r) => <RepoRow key={r.name} repo={r} now={now} />)}
    </>
  )
}

function RepoRow({
  repo,
  now,
  label,
}: {
  repo: Repo
  now: number
  label?: React.ReactNode
}) {
  const broken = unreadableTitle(repo)
  if (broken)
    return (
      <span
        title={broken}
        className="flex h-(--row-h) items-center gap-2 rounded-lg px-2.5 text-base text-faint pointer-coarse:h-11"
      >
        {label ?? (
          <>
            <RepoGlyph name={repo.name} size="sm" />
            <span className="truncate">{repoBase(repo.name)}</span>
          </>
        )}
        <TriangleAlert
          className="ml-auto size-3.5 shrink-0 text-del"
          aria-label={UNREADABLE}
        />
      </span>
    )
  return (
    <Link
      {...repoLink(repo.name, { kind: 'tree', path: '' })}
      title={repo.name}
      activeOptions={{ includeSearch: false }}
      activeProps={{ className: 'bg-active text-foreground' }}
      className={cn(
        'flex h-(--row-h) items-center gap-2 rounded-lg px-2.5 pointer-coarse:h-11',
        'text-base text-muted-foreground transition-colors duration-75',
        'hover:bg-hover hover:text-foreground',
      )}
    >
      {label ?? (
        <>
          <RepoGlyph name={repo.name} size="sm" />
          <span className="truncate">{repoBase(repo.name)}</span>
        </>
      )}
      {isFresh(repo, now) && (
        <span
          title="Commits in the last 7 days"
          className="ml-auto size-1.5 shrink-0 rounded-full bg-primary"
        />
      )}
    </Link>
  )
}

function OrgDot({ org }: { org: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'size-2 shrink-0 rounded-full',
        org ? DOT[orgTone(org)] : 'bg-faint',
      )}
    />
  )
}
