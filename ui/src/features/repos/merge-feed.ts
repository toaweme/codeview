import type { ActivityCommit } from '@/api/types'

export type Stream = {
  repo: string
  commits: ActivityCommit[]
  next?: string
  done: boolean
  loading: boolean
  failed: boolean
}

export type Merged = {
  commits: ActivityCommit[]
  complete: boolean
}

function oldest(s: Stream): number {
  const last = s.commits[s.commits.length - 1]
  return last ? Date.parse(last.committed_at) : Number.POSITIVE_INFINITY
}

function live(s: Stream): boolean {
  return !s.done && !s.failed
}

// a commit older than the watermark may still have an unloaded commit above it
function watermark(streams: Stream[]): number {
  let w = Number.NEGATIVE_INFINITY
  for (const s of streams) if (live(s)) w = Math.max(w, oldest(s))
  return w
}

function sortedPool(streams: Stream[], since: number): ActivityCommit[] {
  return streams
    .flatMap((s) => s.commits)
    .filter((c) => Date.parse(c.committed_at) >= since)
    .sort((a, b) => Date.parse(b.committed_at) - Date.parse(a.committed_at))
}

export function mergeStreams(
  streams: Stream[],
  since = Number.NEGATIVE_INFINITY,
): Merged {
  const w = watermark(streams)
  return {
    commits: sortedPool(streams, Math.max(w, since)),
    complete: w < since || streams.every((s) => !live(s)),
  }
}

export function nextFetches(
  streams: Stream[],
  showing: number,
  want: number,
  since = Number.NEGATIVE_INFINITY,
): string[] {
  const pool = sortedPool(streams, since)
  const reach = pool[showing + want - 1]
  const target = Math.max(
    reach ? Date.parse(reach.committed_at) : Number.NEGATIVE_INFINITY,
    since,
  )
  return streams
    .filter((s) => live(s) && !s.loading && oldest(s) >= target)
    .map((s) => s.repo)
}
