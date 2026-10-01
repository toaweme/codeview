import { type UseQueryResult, useInfiniteQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { releasesQuery } from '@/api/queries'
import type { Repo, RepoList } from '@/api/types'
import { Segmented } from '@/components/segmented'
import { ErrorState } from '@/features/shell/states'
import { usePersistedState } from '@/lib/use-persisted-state'
import { shortRepo } from './activity-links'
import {
  FilterBar,
  MoreSentinel,
  PanelEmpty,
  ReleaseList,
  RepoFilter,
  RowsSkeleton,
} from './activity-panels'
import { FailedRepos } from './failed-repos'
import { allUnreadable } from './unreadable'
import { useRepoFilter } from './use-repo-filter'
import { useRepoNames } from './use-repo-names'
import { byMonth, groupReleases, toRelease } from './versions'

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

  const tagged = useMemo(() => scope.filter((r) => r.tag_count > 0), [scope])
  const tagCounts = useMemo(
    () => new Map(tagged.map((r) => [r.name, r.tag_count])),
    [tagged],
  )
  const feed = useInfiniteQuery(
    releasesQuery(org, picked, shown === 'versions'),
  )
  const pending = repos.isPending || feed.isPending
  const releases = useMemo(
    () => feed.data?.pages.flatMap((p) => p.releases.map(toRelease)) ?? [],
    [feed.data],
  )
  // every page carries the counts for the whole selection
  const counts = feed.data?.pages[0]
  const total = (shown === 'all' ? counts?.total : counts?.versions) ?? 0
  const hidden = counts ? counts.total - counts.versions : 0
  const failed = feed.data?.pages.at(-1)?.failed ?? []

  const names = useRepoNames()
  const groups = useMemo(
    () =>
      grouping === 'month'
        ? groupReleases(releases, ...byMonth)
        : groupReleases(
            releases,
            (r) => r.repo,
            (r) => shortRepo(r.repo, org, names.display),
          ),
    [releases, grouping, org, names],
  )

  return (
    <section className="flex min-w-0 flex-col gap-3">
      <FilterBar
        count={
          pending
            ? undefined
            : `${total.toLocaleString()} ${total === 1 ? 'release' : 'releases'}`
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
      <FailedRepos failed={failed} />
      <div className="rounded-2xl bg-island-muted p-1.5">
        {repos.isError || feed.isError ? (
          <ErrorState error={repos.error ?? feed.error} />
        ) : pending ? (
          <RowsSkeleton rows={12} />
        ) : releases.length === 0 ? (
          hidden > 0 ? (
            <PanelEmpty
              light
              title="No version tags here"
              description="Pick all tags to see the others."
            />
          ) : allUnreadable(failed.length, picked.length || scope.length) ? (
            <PanelEmpty
              light
              title="These repositories couldn't be read"
              description="View the list above to see which ones."
            />
          ) : (
            <PanelEmpty
              title="No releases yet"
              description="Tags from your repositories show up here."
            />
          )
        ) : (
          <>
            <ReleaseList
              groups={groups}
              org={org}
              showRepo={grouping === 'month'}
            />
            {feed.hasNextPage && (
              <MoreSentinel
                onMore={() => {
                  if (!feed.isFetchingNextPage) feed.fetchNextPage()
                }}
                loading={feed.isFetchingNextPage}
                auto
              />
            )}
          </>
        )}
      </div>
    </section>
  )
}
