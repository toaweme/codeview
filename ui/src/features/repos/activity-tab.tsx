import type { UseQueryResult } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import type { Repo, RepoList } from '@/api/types'
import { SearchInput } from '@/components/search-input'
import { Segmented } from '@/components/segmented'
import { ErrorState } from '@/features/shell/states'
import {
  CommitFeed,
  FilterBar,
  MoreSentinel,
  PanelEmpty,
  RepoFilter,
  RowsSkeleton,
} from './activity-panels'
import { useCrossRepoLog } from './use-cross-repo-log'
import { useRepoFilter } from './use-repo-filter'

type Range = 'all' | '7' | '30' | '90'

const RANGES: { value: Range; label: string }[] = [
  { value: 'all', label: 'Any time' },
  { value: '7', label: '7 days' },
  { value: '30', label: '30 days' },
  { value: '90', label: '90 days' },
]

// stops a filter matching nothing from walking every repo's whole history
const IDLE_LOADS = 6

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
  const [idle, setIdle] = useState({ loads: 0, matches: 0 })

  const withHistory = useMemo(
    () => scope.filter((r) => r.lastCommit && r.defaultBranch),
    [scope],
  )
  const streams = useMemo(
    () =>
      withHistory
        .filter((r) => picked.length === 0 || picked.includes(r.name))
        .map((r) => ({ name: r.name, ref: r.defaultBranch })),
    [withHistory, picked],
  )
  // measured once when picked so the cut stays put while the page is open
  const since = useMemo(
    () =>
      range === 'all' ? undefined : Date.now() - Number(range) * 86_400_000,
    [range],
  )
  const feed = useCrossRepoLog(streams, since)

  const filtered = useMemo(() => {
    const a = author.trim().toLowerCase()
    const m = message.trim().toLowerCase()
    if (!a && !m) return feed.commits
    return feed.commits.filter(
      (c) =>
        (!a ||
          c.author.name.toLowerCase().includes(a) ||
          c.author.email.toLowerCase().includes(a)) &&
        (!m || c.subject.toLowerCase().includes(m)),
    )
  }, [feed.commits, author, message])

  const narrowed = author.trim() !== '' || message.trim() !== ''
  const more = () => {
    setIdle((s) =>
      filtered.length > s.matches
        ? { loads: 1, matches: filtered.length }
        : { loads: s.loads + 1, matches: s.matches },
    )
    feed.loadMore()
  }

  return (
    <section className="flex min-w-0 flex-col gap-3">
      <FilterBar
        count={
          feed.pending
            ? undefined
            : `${filtered.length.toLocaleString()}${feed.complete ? '' : '+'} ${filtered.length === 1 ? 'commit' : 'commits'}`
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
          onChange={(v) => {
            setMessage(v)
            setIdle({ loads: 0, matches: 0 })
          }}
          placeholder="Filter messages"
          className="w-64 min-w-0 shrink"
        />
        <SearchInput
          value={author}
          onChange={(v) => {
            setAuthor(v)
            setIdle({ loads: 0, matches: 0 })
          }}
          placeholder="Filter authors"
          className="w-52 min-w-0 shrink"
        />
        <Segmented value={range} onChange={setRange} options={RANGES} />
      </FilterBar>
      <div className="rounded-2xl bg-island-muted p-1.5">
        {repos.isError ? (
          <ErrorState error={repos.error} />
        ) : repos.isPending || (feed.pending && filtered.length === 0) ? (
          <RowsSkeleton rows={12} />
        ) : filtered.length === 0 && feed.complete ? (
          <PanelEmpty>
            {narrowed || range !== 'all'
              ? 'No commits match these filters.'
              : 'No commits yet.'}
          </PanelEmpty>
        ) : (
          <>
            <CommitFeed commits={filtered} org={org} sticky />
            {!feed.complete && (
              <MoreSentinel
                onMore={more}
                loading={feed.loading}
                auto={!narrowed || idle.loads < IDLE_LOADS}
              />
            )}
          </>
        )}
        {feed.failed.length > 0 && (
          <p className="px-2.5 py-2 text-faint text-sm">
            Could not load the history of {feed.failed.join(', ')}.
          </p>
        )}
      </div>
    </section>
  )
}
