import type { UseQueryResult } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import type { Repo, RepoList } from '@/api/types'
import { SearchInput } from '@/components/search-input'
import { Segmented } from '@/components/segmented'
import { ErrorState } from '@/features/shell/states'
import { useDebounced } from '@/lib/use-debounced'
import {
  CommitFeed,
  FilterBar,
  MoreSentinel,
  PanelEmpty,
  RepoFilter,
  RowsSkeleton,
} from './activity-panels'
import { FailedRepos } from './failed-repos'
import { allUnreadable } from './unreadable'
import { useCommitFeed } from './use-commit-feed'
import { useRepoFilter } from './use-repo-filter'

type Range = 'all' | '7' | '30' | '90'

// long enough to skip the keystrokes of a word, short enough to feel live
const FILTER_DELAY = 300

const RANGES: { value: Range; label: string }[] = [
  { value: 'all', label: 'Any time' },
  { value: '7', label: '7 days' },
  { value: '30', label: '30 days' },
  { value: '90', label: '90 days' },
]

export function ActivityTab({
  org,
  scope,
  repos,
}: {
  org?: string
  scope: Repo[]
  repos: UseQueryResult<RepoList>
}) {
  const [picked, setPicked] = useRepoFilter()
  const [author, setAuthor] = useState('')
  const [message, setMessage] = useState('')
  const [range, setRange] = useState<Range>('all')

  const withHistory = useMemo(
    () => scope.filter((r) => r.last_commit && r.default_branch),
    [scope],
  )
  // measured once when picked so the cut stays put while the page is open
  const since = useMemo(
    () =>
      range === 'all' ? undefined : Date.now() - Number(range) * 86_400_000,
    [range],
  )
  const typedAuthor = useDebounced(author, FILTER_DELAY)
  const typedMessage = useDebounced(message, FILTER_DELAY)
  const feed = useCommitFeed(org, picked, {
    since,
    author: typedAuthor,
    message: typedMessage,
  })
  const filtered = feed.commits
  const narrowed = typedAuthor.trim() !== '' || typedMessage.trim() !== ''

  return (
    <section className="flex min-w-0 flex-col gap-3">
      <FilterBar
        count={
          feed.pending
            ? undefined
            : `${filtered.length.toLocaleString()}${feed.status === 'done' || feed.status === 'noMatch' ? '' : '+'} ${filtered.length === 1 ? 'commit' : 'commits'}`
        }
      >
        <RepoFilter
          repos={withHistory.map((r) => r.name)}
          org={org}
          selected={picked}
          onChange={setPicked}
        />
        <SearchInput
          value={message}
          onChange={setMessage}
          placeholder="Filter messages"
          className="min-w-0 flex-1 basis-40 sm:w-64 sm:flex-none sm:shrink"
        />
        <SearchInput
          value={author}
          onChange={setAuthor}
          placeholder="Filter authors"
          className="min-w-0 flex-1 basis-40 sm:w-52 sm:flex-none sm:shrink"
        />
        <Segmented value={range} onChange={setRange} options={RANGES} />
      </FilterBar>
      <FailedRepos failed={feed.failed} />
      <div className="rounded-2xl bg-island-muted p-1.5">
        {repos.isError || feed.error ? (
          <ErrorState error={repos.error ?? feed.error} />
        ) : repos.isPending || (feed.pending && filtered.length === 0) ? (
          <RowsSkeleton rows={12} />
        ) : feed.status === 'noMatch' ? (
          narrowed || range !== 'all' ? (
            <PanelEmpty
              light
              title="No commits match"
              description="Try a wider range or fewer filters."
            />
          ) : allUnreadable(
              feed.failed.length,
              picked.length || scope.length,
            ) ? (
            <PanelEmpty
              light
              title="These repositories couldn't be read"
              description="View the list above to see which ones."
            />
          ) : (
            <PanelEmpty
              title="No commits yet"
              description="New commits across your repositories show up here."
            />
          )
        ) : (
          <>
            {filtered.length > 0 && (
              <CommitFeed commits={filtered} org={org} sticky />
            )}
            {feed.status === 'searching' && (
              <SearchStatus
                text={`Searching older history, ${feed.scanned.toLocaleString()} commits scanned`}
                action="Stop"
                onAction={feed.stop}
              />
            )}
            {feed.status === 'stopped' && (
              <SearchStatus
                text={`Search stopped after ${feed.scanned.toLocaleString()} commits`}
                action="Continue searching"
                onAction={feed.resume}
              />
            )}
            {feed.status === 'more' && (
              <MoreSentinel
                onMore={feed.loadMore}
                loading={feed.loading}
                auto
              />
            )}
          </>
        )}
      </div>
    </section>
  )
}

function SearchStatus({
  text,
  action,
  onAction,
}: {
  text: string
  action: string
  onAction: () => void
}) {
  return (
    <div
      className="flex items-center justify-between gap-3 px-2.5 py-2 text-faint text-sm"
      role="status"
    >
      <span className="num min-w-0 truncate">{text}</span>
      <button
        type="button"
        onClick={onAction}
        className="shrink-0 rounded-md px-2 py-1 font-medium text-muted-foreground hover:bg-hover hover:text-foreground"
      >
        {action}
      </button>
    </div>
  )
}
