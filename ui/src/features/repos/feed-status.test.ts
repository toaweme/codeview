import { describe, expect, test } from 'vitest'
import { type FeedProgress, FILL, feedStatus } from './feed-status'

const base: FeedProgress = {
  commits: 0,
  hasNext: false,
  lastPartial: false,
  stopped: false,
}

describe('feedStatus', () => {
  test.each<[string, Partial<FeedProgress>, string]>([
    ['finished empty', {}, 'noMatch'],
    ['finished with results', { commits: 3 }, 'done'],
    [
      'scan cut short with nothing yet',
      { hasNext: true, lastPartial: true },
      'searching',
    ],
    [
      'scan cut short with a few',
      { commits: FILL - 1, hasNext: true, lastPartial: true },
      'searching',
    ],
    [
      'scan cut short with a full view',
      { commits: FILL, hasNext: true, lastPartial: true },
      'more',
    ],
    [
      'stopped mid search',
      { hasNext: true, lastPartial: true, stopped: true },
      'stopped',
    ],
    ['full page with more', { commits: 40, hasNext: true }, 'more'],
    [
      'stopped flag after a full page',
      { commits: 40, hasNext: true, stopped: true },
      'more',
    ],
  ])('%s', (_, patch, want) => {
    expect(feedStatus({ ...base, ...patch })).toBe(want)
  })
})
