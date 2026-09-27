import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { Link2 } from 'lucide-react'
import { useMemo } from 'react'
import { reposQuery } from '@/api/queries'
import type { Repo } from '@/api/types'
import { Segmented } from '@/components/segmented'
import { AppShell } from '@/features/shell/app-shell'
import { MoreMenu, TopLine } from '@/features/shell/top-line'
import { copyText } from '@/lib/clipboard'
import { cn } from '@/lib/cn'
import { groupRepos, repoBase } from '@/lib/repo-name'
import { groupLink, repoLink } from '@/lib/url'
import { ActivityTab } from './activity-tab'
import { BranchesTab } from './branches-tab'
import {
  type OverviewView,
  overviewLink,
  parseOverviewSearch,
} from './overview-nav'
import { OverviewTab } from './overview-tab'
import { ReleasesTab } from './releases-tab'
import { useRepoNames } from './use-repo-names'

const TABS: { value: OverviewView; label: string }[] = [
  { value: 'overview', label: 'Overview' },
  { value: 'activity', label: 'Activity' },
  { value: 'releases', label: 'Releases' },
  { value: 'branches', label: 'Branches' },
]

export function RepoList({ org }: { org?: string }) {
  const q = useQuery(reposQuery())
  const view: OverviewView =
    parseOverviewSearch(useSearch({ strict: false })).view ?? 'overview'
  const navigate = useNavigate()
  const names = useRepoNames()

  const scope = useMemo(
    () =>
      (q.data?.repos ?? [])
        .filter((r) => !org || r.name.startsWith(`${org}/`))
        .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)),
    [q.data, org],
  )

  return (
    <AppShell
      section="repos"
      sidebar={<RepoSidebar repos={q.data?.repos ?? []} org={org} />}
    >
      <TopLine
        crumbs={[
          org
            ? { key: 'all', label: 'Repositories', link: { to: '/' } }
            : { key: 'all', label: 'Repositories' },
          ...(org
            ? [
                {
                  key: 'org',
                  label: names.display(org),
                  menu: { kind: 'org', org } as const,
                },
              ]
            : []),
        ]}
      >
        <Segmented
          value={view}
          onChange={(v) => navigate(overviewLink(org, v))}
          options={TABS}
        />
        <MoreMenu
          items={[
            {
              key: 'copy-link',
              label: 'Copy link',
              icon: Link2,
              run: () => void copyText(window.location.href, 'Link'),
            },
          ]}
        />
      </TopLine>
      <div className="min-h-0 flex-1 overflow-auto">
        <div className="mx-auto flex max-w-[1440px] flex-col gap-10 px-4 pt-2 pb-12 sm:px-6">
          {view === 'overview' ? (
            <OverviewTab org={org} scope={scope} repos={q} />
          ) : view === 'activity' ? (
            <ActivityTab key={org ?? ''} org={org} scope={scope} repos={q} />
          ) : view === 'releases' ? (
            <ReleasesTab key={org ?? ''} org={org} scope={scope} repos={q} />
          ) : (
            <BranchesTab key={org ?? ''} org={org} scope={scope} repos={q} />
          )}
        </div>
      </div>
    </AppShell>
  )
}

function RepoSidebar({ repos, org }: { repos: Repo[]; org?: string }) {
  const names = useRepoNames()
  const groups = useMemo(
    () => groupRepos([...repos].sort((a, b) => a.name.localeCompare(b.name))),
    [repos],
  )
  return (
    <div className="min-h-0 flex-1 overflow-auto px-2 pt-2 pb-3">
      {groups.map(({ parent, repos: list }) => (
        <section key={parent} className="mb-4">
          {parent ? (
            <Link
              {...groupLink(parent)}
              className={cn(
                'flex h-8 items-center rounded-lg px-2.5',
                'font-medium text-faint text-sm transition-colors duration-75',
                'hover:text-foreground',
                parent === org && 'text-foreground',
              )}
            >
              <span className="truncate">{names.display(parent)}</span>
            </Link>
          ) : (
            groups.length > 1 && (
              <p className="flex h-8 items-center px-2.5 font-medium text-faint text-sm">
                Ungrouped
              </p>
            )
          )}
          {list.map((r) => (
            <Link
              key={r.name}
              {...repoLink(r.name, { kind: 'tree', path: '' })}
              title={r.name}
              className={cn(
                'flex h-(--row-h) items-center rounded-lg px-2.5',
                'text-base text-muted-foreground transition-colors duration-75',
                'hover:bg-hover hover:text-foreground',
              )}
            >
              <span className="truncate">{repoBase(r.name)}</span>
            </Link>
          ))}
        </section>
      ))}
    </div>
  )
}
