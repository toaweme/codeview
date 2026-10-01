import { useInfiniteQuery } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { activityCommitsQuery } from '@/api/queries'
import { feedStatus } from './feed-status'

// the server merges and filters every repository's history, so the feed is one request per page
export function useCommitFeed(
  org: string | undefined,
  repos: string[],
  filter: { since?: number; author: string; message: string },
) {
  const query = useMemo(
    () => ({
      since:
        filter.since === undefined
          ? undefined
          : new Date(filter.since).toISOString(),
      author: filter.author.trim() || undefined,
      message: filter.message.trim() || undefined,
    }),
    [filter.since, filter.author, filter.message],
  )
  const options = activityCommitsQuery(org, repos, query)
  const feed = useInfiniteQuery(options)
  // a stop belongs to the search it was pressed on, so new filters search again
  const key = JSON.stringify(options.queryKey)
  const [stoppedKey, setStoppedKey] = useState<string | null>(null)
  const pages = feed.data?.pages
  const commits = useMemo(() => pages?.flatMap((p) => p.commits) ?? [], [pages])
  const scanned = useMemo(
    () => pages?.reduce((n, p) => n + (p.scanned ?? 0), 0) ?? 0,
    [pages],
  )
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = feed
  const status = feedStatus({
    commits: commits.length,
    hasNext: hasNextPage,
    lastPartial: pages?.at(-1)?.partial === true,
    stopped: stoppedKey === key,
  })
  const searching = !feed.isPending && status === 'searching'

  // the old key's query loses its observer when filters change, which aborts its fetch,
  // so this only ever continues the search on screen
  useEffect(() => {
    if (searching && !isFetchingNextPage && !feed.isError) fetchNextPage()
  }, [searching, isFetchingNextPage, feed.isError, fetchNextPage])

  const loadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) fetchNextPage()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  return {
    commits,
    status: feed.isPending ? undefined : status,
    scanned,
    loading: isFetchingNextPage,
    pending: feed.isPending,
    failed: pages?.at(-1)?.failed ?? [],
    error: feed.error,
    loadMore,
    stop: () => setStoppedKey(key),
    resume: () => setStoppedKey(null),
  }
}
