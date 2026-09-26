import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { refsQuery, repoActivityQuery } from '@/api/queries'
import { Segmented } from '@/components/segmented'
import { Select } from '@/components/select'
import { repoCrumbs } from '@/features/code/path-actions'
import {
  BranchList,
  FilterBar,
  PanelEmpty,
  ReleaseList,
  RowsSkeleton,
} from '@/features/repos/activity-panels'
import {
  BRANCH_SORTS,
  type BranchSort,
  groupBranches,
} from '@/features/repos/branch-groups'
import {
  buildReleases,
  byMonth,
  groupReleases,
} from '@/features/repos/versions'
import { ErrorState } from '@/features/shell/states'
import { TopLine } from '@/features/shell/top-line'
import { repoLink } from '@/lib/url'

type RefsKind = 'branches' | 'releases'

const KINDS: { value: RefsKind; label: string }[] = [
  { value: 'branches', label: 'Branches' },
  { value: 'releases', label: 'Releases' },
]

function RefsFrame({
  repo,
  kind,
  children,
}: {
  repo: string
  kind: RefsKind
  children: React.ReactNode
}) {
  const navigate = useNavigate()
  return (
    <>
      <TopLine
        crumbs={[
          ...repoCrumbs(repo),
          {
            key: kind,
            label: KINDS.find((k) => k.value === kind)?.label ?? kind,
          },
        ]}
      >
        <Segmented
          value={kind}
          onChange={(k) => navigate(repoLink(repo, { kind: k }))}
          options={KINDS}
        />
      </TopLine>
      <div className="min-h-0 flex-1 overflow-auto">
        <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-3 px-4 pt-2 pb-12 sm:px-6">
          {children}
        </div>
      </div>
    </>
  )
}

export function BranchesView({ repo }: { repo: string }) {
  const q = useQuery(repoActivityQuery(repo))
  const refs = useQuery(refsQuery(repo))
  const [sort, setSort] = useState<BranchSort>('recent')
  const groups = useMemo(
    () => groupBranches(q.data?.branches ?? [], sort),
    [q.data, sort],
  )
  const total = groups.people.length + groups.bots.length + groups.merged.length
  const base = refs.data?.default
  const others = refs.data ? refs.data.branches.length - 1 : 0

  return (
    <RefsFrame repo={repo} kind="branches">
      <FilterBar
        count={
          q.data
            ? `${total.toLocaleString()} ${total === 1 ? 'branch' : 'branches'}`
            : undefined
        }
      >
        <span className="shrink-0 whitespace-nowrap text-muted-foreground text-sm">
          Sort
        </span>
        <Select
          label="Sort"
          value={sort}
          onChange={setSort}
          options={BRANCH_SORTS}
          className="w-56 min-w-36 shrink"
        />
      </FilterBar>
      <p className="flex flex-wrap gap-x-5 gap-y-1 px-1 text-faint text-sm">
        <span>↑ commits not in {base ?? 'the default branch'}</span>
        <span>↓ commits the branch is missing</span>
      </p>
      <div className="rounded-2xl bg-island-muted p-1.5">
        {q.isPending ? (
          <RowsSkeleton rows={10} />
        ) : q.isError ? (
          <ErrorState error={q.error} />
        ) : total === 0 ? (
          <PanelEmpty>Only the default branch exists.</PanelEmpty>
        ) : (
          <BranchList groups={groups} base={() => base} showRepo={false} />
        )}
        {others > total && (
          <p className="px-2.5 py-2 text-faint text-sm">
            Showing the {total.toLocaleString()} most recently updated of{' '}
            {others.toLocaleString()} branches.
          </p>
        )}
      </div>
    </RefsFrame>
  )
}

type Shown = 'versions' | 'all'

export function ReleasesView({ repo }: { repo: string }) {
  const refs = useQuery(refsQuery(repo))
  const [shown, setShown] = useState<Shown>('versions')
  const all = useMemo(
    () => (refs.data ? buildReleases(repo, refs.data.tags) : []),
    [refs.data, repo],
  )
  const releases = useMemo(
    () => all.filter((r) => shown === 'all' || r.isVersion),
    [all, shown],
  )
  const hidden = all.length - all.filter((r) => r.isVersion).length
  const groups = useMemo(() => groupReleases(releases, ...byMonth), [releases])

  return (
    <RefsFrame repo={repo} kind="releases">
      <FilterBar
        count={
          refs.data
            ? `${releases.length.toLocaleString()} ${releases.length === 1 ? 'release' : 'releases'}`
            : undefined
        }
      >
        <Segmented
          value={shown}
          onChange={setShown}
          options={[
            { value: 'versions', label: 'Versions' },
            {
              value: 'all',
              label: 'All tags',
              title:
                hidden > 0
                  ? `${hidden.toLocaleString()} tags are not versions`
                  : undefined,
            },
          ]}
        />
      </FilterBar>
      <div className="rounded-2xl bg-island-muted p-1.5">
        {refs.isPending ? (
          <RowsSkeleton rows={12} />
        ) : refs.isError ? (
          <ErrorState error={refs.error} />
        ) : releases.length === 0 ? (
          <PanelEmpty>
            {hidden > 0
              ? 'No version tags here. Pick all tags to see the others.'
              : 'No tags yet.'}
          </PanelEmpty>
        ) : (
          <ReleaseList groups={groups} showRepo={false} />
        )}
      </div>
    </RefsFrame>
  )
}
