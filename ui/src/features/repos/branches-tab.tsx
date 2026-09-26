import {
  queryOptions,
  type UseQueryResult,
  useQuery,
} from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { getJSON } from '@/api/client'
import type { Activity, Repo, RepoList } from '@/api/types'
import { Select } from '@/components/select'
import { ErrorState } from '@/features/shell/states'
import {
  BranchList,
  FilterBar,
  PanelEmpty,
  RepoFilter,
  RowsSkeleton,
} from './activity-panels'
import { BRANCH_SORTS, type BranchSort, groupBranches } from './branch-groups'
import { useRepoFilter } from './use-repo-filter'

const BRANCH_LIMIT = 50

const branchesQuery = (org?: string) =>
  queryOptions({
    queryKey: ['activity', org ?? '', BRANCH_LIMIT],
    queryFn: ({ signal }) =>
      getJSON<Activity>('activity', { org, limit: BRANCH_LIMIT }, signal),
    staleTime: 60_000,
  })

export function BranchesTab({
  org,
  scope,
  repos,
}: {
  org?: string
  scope: Repo[]
  repos: UseQueryResult<RepoList>
}) {
  const q = useQuery(branchesQuery(org))
  const [picked, setPicked] = useRepoFilter()
  const [sort, setSort] = useState<BranchSort>('recent')

  const defaults = useMemo(
    () => new Map(scope.map((r) => [r.name, r.defaultBranch])),
    [scope],
  )
  const perRepo = useMemo(() => {
    const m = new Map<string, number>()
    for (const b of q.data?.branches ?? [])
      m.set(b.repo, (m.get(b.repo) ?? 0) + 1)
    return m
  }, [q.data])
  const withBranches = useMemo(
    () => scope.filter((r) => perRepo.has(r.name)).map((r) => r.name),
    [scope, perRepo],
  )

  const groups = useMemo(
    () =>
      groupBranches(
        (q.data?.branches ?? []).filter(
          (b) => picked.length === 0 || picked.includes(b.repo),
        ),
        sort,
      ),
    [q.data, picked, sort],
  )
  const total = groups.people.length + groups.bots.length + groups.merged.length

  return (
    <section className="flex min-w-0 flex-col gap-3">
      <FilterBar
        count={
          q.data
            ? `${total.toLocaleString()} ${total === 1 ? 'branch' : 'branches'}`
            : undefined
        }
      >
        <RepoFilter
          repos={withBranches}
          org={org}
          selected={picked}
          onChange={setPicked}
          counts={perRepo}
        />
        <span className="shrink-0 whitespace-nowrap pl-2 text-muted-foreground text-sm">
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
        <span>↑ commits not in the default branch</span>
        <span>↓ commits the branch is missing</span>
      </p>
      <div className="rounded-2xl bg-island-muted p-1.5">
        {q.isPending || repos.isPending ? (
          <RowsSkeleton rows={10} />
        ) : q.isError ? (
          <ErrorState error={q.error} />
        ) : total === 0 ? (
          <PanelEmpty>Every repository is on its default branch.</PanelEmpty>
        ) : (
          <BranchList
            groups={groups}
            base={(b) => defaults.get(b.repo)}
            org={org}
            showRepo
          />
        )}
      </div>
    </section>
  )
}
