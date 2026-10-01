// searching keeps fetching on its own, stopped waits for the reader to continue,
// noMatch is a finished search that found nothing, more has results with history after them,
// and done has nothing left to load.
export type FeedStatus = 'searching' | 'stopped' | 'noMatch' | 'more' | 'done'

// FILL is how many matches a filtered search gathers before it waits for scrolling.
export const FILL = 20

export type FeedProgress = {
  commits: number
  hasNext: boolean
  // lastPartial means the newest page stopped at the server's scan cap
  lastPartial: boolean
  stopped: boolean
}

// feedStatus decides whether a feed keeps searching by itself.
// Only a page cut short by the scan cap continues automatically, and only until the view fills.
export function feedStatus(p: FeedProgress): FeedStatus {
  if (!p.hasNext) return p.commits === 0 ? 'noMatch' : 'done'
  if (p.lastPartial && p.commits < FILL)
    return p.stopped ? 'stopped' : 'searching'
  return 'more'
}
