import { describe, expect, test } from 'vitest'
import type { ActivityCommit } from '@/api/types'
import { mergeStreams, nextFetches, type Stream } from './merge-feed'

function c(repo: string, day: number): ActivityCommit {
  const when = `2026-09-${String(day).padStart(2, '0')}T12:00:00Z`
  return {
    repo,
    hash: `${repo}${day}`,
    subject: '',
    author: { name: '', email: '', date: when },
    committedAt: when,
    ref: 'main',
  }
}

function s(repo: string, days: number[], over: Partial<Stream> = {}): Stream {
  return {
    repo,
    commits: days.map((d) => c(repo, d)),
    done: false,
    loading: false,
    failed: false,
    ...over,
  }
}

const hashes = (list: ActivityCommit[]) => list.map((x) => x.hash)

describe('mergeStreams', () => {
  const cases: {
    name: string
    streams: Stream[]
    since?: number
    want: string[]
    complete: boolean
  }[] = [
    {
      name: 'holds back commits below the newest unfinished stream',
      streams: [s('a', [20, 18, 10]), s('b', [19, 15])],
      want: ['a20', 'b19', 'a18', 'b15'],
      complete: false,
    },
    {
      name: 'a finished stream does not hold anything back',
      streams: [s('a', [20, 10], { done: true }), s('b', [19, 15])],
      want: ['a20', 'b19', 'b15'],
      complete: false,
    },
    {
      name: 'shows everything once every stream is done',
      streams: [
        s('a', [20, 10], { done: true }),
        s('b', [19], { failed: true }),
      ],
      want: ['a20', 'b19', 'a10'],
      complete: true,
    },
    {
      name: 'a stream with nothing loaded shows nothing',
      streams: [s('a', [20]), s('b', [])],
      want: [],
      complete: false,
    },
    {
      name: 'since cuts the feed and completes it',
      streams: [s('a', [20, 12]), s('b', [19, 11])],
      since: Date.parse('2026-09-15T00:00:00Z'),
      want: ['a20', 'b19'],
      complete: true,
    },
  ]
  for (const tc of cases) {
    test(tc.name, () => {
      const m = mergeStreams(tc.streams, tc.since)
      expect(hashes(m.commits)).toEqual(tc.want)
      expect(m.complete).toBe(tc.complete)
    })
  }
})

describe('nextFetches', () => {
  const cases: {
    name: string
    streams: Stream[]
    showing: number
    want: number
    fetch: string[]
  }[] = [
    {
      name: 'every unloaded stream fetches',
      streams: [s('a', []), s('b', [])],
      showing: 0,
      want: 10,
      fetch: ['a', 'b'],
    },
    {
      name: 'a stream already past the reach waits',
      streams: [s('a', [20, 19, 18, 17]), s('b', [16, 5])],
      showing: 2,
      want: 2,
      fetch: ['a'],
    },
    {
      name: 'too few loaded fetches every live stream',
      streams: [s('a', [20]), s('b', [19], { done: true }), s('c', [18])],
      showing: 0,
      want: 10,
      fetch: ['a', 'c'],
    },
    {
      name: 'a loading stream is not fetched twice',
      streams: [s('a', [20], { loading: true }), s('b', [19])],
      showing: 0,
      want: 10,
      fetch: ['b'],
    },
  ]
  for (const tc of cases) {
    test(tc.name, () => {
      expect(nextFetches(tc.streams, tc.showing, tc.want)).toEqual(tc.fetch)
    })
  }
})
