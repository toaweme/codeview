import { type UseQueryResult, useQueries } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { refsQuery } from '@/api/queries'
import type { Repo, RepoList } from '@/api/types'
import { Segmented } from '@/components/segmented'
import { ErrorState } from '@/features/shell/states'
import { usePersistedState } from '@/lib/use-persisted-state'
import { shortRepo } from './activity-links'
import {
  FilterBar,
  PanelEmpty,
  ReleaseList,
  RepoFilter,
  RowsSkeleton,
} from './activity-panels'
import { useRepoFilter } from './use-repo-filter'
import { buildReleases, byMonth, groupReleases } from './versions'

type Grouping = 'month' | 'repo'
type Shown = 'versions' | 'all'

export function ReleasesTab({
  org,
  scope,
  repos,
}: {
  org?: string
  scope: Repo[]
  repos: UseQueryResult<RepoList>
}) {
  const [grouping, setGrouping] = usePersistedState<Grouping>(
    'releases.grouping',
    'month',
  )
  const [shown, setShown] = useState<Shown>('versions')
  const [picked, setPicked] = useRepoFilter()

  const tagged = useMemo(() => scope.filter((r) => r.tagCount > 0), [scope])
  const tagCounts = useMemo(
    () => new Map(tagged.map((r) => [r.name, r.tagCount])),
    [tagged],
  )
  const inView = useMemo(
    () => tagged.filter((r) => picked.length === 0 || picked.includes(r.name)),
    [tagged, picked],
  )
  const refs = useQueries({
    queries: inView.map((r) => refsQuery(r.name)),
  })
  const pending = repos.isPending || refs.some((q) => q.isPending)
  const failed = inView.filter((_, i) => refs[i]?.isError).map((r) => r.name)

  const all = inView.flatMap((r, i) => {
    const data = refs[i]?.data
    return data ? buildReleases(r.name, data.tags) : []
  })
  const releases = useMemo(
    () =>
      all
        .filter((r) => shown === 'all' || r.isVersion)
        .sort((a, b) => Date.parse(b.taggedAt) - Date.parse(a.taggedAt)),
    [all, shown],
  )
  const hidden = all.length - all.filter((r) => r.isVersion).length

  const groups = useMemo(
    () =>
      grouping === 'month'
        ? groupReleases(releases, ...byMonth)
        : groupReleases(
            releases,
            (r) => r.repo,
            (r) => shortRepo(r.repo, org),
          ),
    [releases, grouping, org],
  )

  return (
    <section className="flex min-w-0 flex-col gap-3">
      <FilterBar
        count={
          pending
            ? undefined
            : `${releases.length.toLocaleString()} ${releases.length === 1 ? 'release' : 'releases'}`
        }
      >
        <RepoFilter
          repos={tagged.map((r) => r.name)}
          org={org}
          selected={picked}
          onChange={setPicked}
          counts={tagCounts}
        />
        <Segmented
          value={grouping}
          onChange={setGrouping}
          options={[
            { value: 'month', label: 'By month' },
            { value: 'repo', label: 'By repository' },
          ]}
        />
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
        {repos.isError ? (
          <ErrorState error={repos.error} />
        ) : pending ? (
          <RowsSkeleton rows={12} />
        ) : releases.length === 0 ? (
          <PanelEmpty>
            {hidden > 0
              ? 'No version tags here. Pick all tags to see the others.'
              : 'No tags yet.'}
          </PanelEmpty>
        ) : (
          <ReleaseList
            groups={groups}
            org={org}
            showRepo={grouping === 'month'}
          />
        )}
        {failed.length > 0 && (
          <p className="px-2.5 py-2 text-faint text-sm">
            Could not load the tags of {failed.join(', ')}.
          </p>
        )}
      </div>
    </section>
  )
}
