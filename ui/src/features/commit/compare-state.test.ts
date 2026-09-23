import { expect, test } from 'vitest'
import type { Commit } from '@/api/types'
import type { CompareMode } from '@/lib/url'
import { type CompareView, compareView } from './compare-state'

const commit = (hash: string, parents: string[] = ['p']): Commit =>
  ({ hash, parents }) as unknown as Commit

test('compareView covers every shape and mode', () => {
  const cases: {
    name: string
    ahead: number
    behind: number
    boundary: Commit | null
    mode?: CompareMode
    want: CompareView
  }[] = [
    {
      name: 'same',
      ahead: 0,
      behind: 0,
      boundary: commit('h'),
      want: {
        shape: 'same',
        mode: 'since',
        dropMode: false,
        toggle: false,
        diff: false,
        startingPoint: false,
      },
    },
    {
      name: 'same drops direct',
      ahead: 0,
      behind: 0,
      boundary: commit('h'),
      mode: 'direct',
      want: {
        shape: 'same',
        mode: 'since',
        dropMode: true,
        toggle: false,
        diff: false,
        startingPoint: false,
      },
    },
    {
      name: 'forward',
      ahead: 3,
      behind: 0,
      boundary: commit('b'),
      want: {
        shape: 'forward',
        mode: 'since',
        dropMode: false,
        toggle: false,
        diff: true,
        startingPoint: true,
      },
    },
    {
      name: 'forward drops direct',
      ahead: 3,
      behind: 0,
      boundary: commit('b'),
      mode: 'direct',
      want: {
        shape: 'forward',
        mode: 'since',
        dropMode: true,
        toggle: false,
        diff: true,
        startingPoint: true,
      },
    },
    {
      name: 'forward from a root commit has nothing to include',
      ahead: 3,
      behind: 0,
      boundary: commit('b', []),
      want: {
        shape: 'forward',
        mode: 'since',
        dropMode: false,
        toggle: false,
        diff: true,
        startingPoint: false,
      },
    },
    {
      name: 'reversed',
      ahead: 0,
      behind: 13,
      boundary: commit('h'),
      want: {
        shape: 'reversed',
        mode: 'since',
        dropMode: false,
        toggle: false,
        diff: false,
        startingPoint: false,
      },
    },
    {
      name: 'reversed as removals',
      ahead: 0,
      behind: 13,
      boundary: commit('b'),
      mode: 'direct',
      want: {
        shape: 'reversed',
        mode: 'direct',
        dropMode: false,
        toggle: false,
        diff: true,
        startingPoint: false,
      },
    },
    {
      name: 'diverged',
      ahead: 5,
      behind: 12,
      boundary: commit('m'),
      want: {
        shape: 'diverged',
        mode: 'since',
        dropMode: false,
        toggle: true,
        diff: true,
        startingPoint: true,
      },
    },
    {
      name: 'diverged direct',
      ahead: 5,
      behind: 12,
      boundary: commit('b'),
      mode: 'direct',
      want: {
        shape: 'diverged',
        mode: 'direct',
        dropMode: false,
        toggle: true,
        diff: true,
        startingPoint: true,
      },
    },
    {
      name: 'diverged without a common ancestor',
      ahead: 5,
      behind: 12,
      boundary: null,
      want: {
        shape: 'diverged',
        mode: 'since',
        dropMode: false,
        toggle: true,
        diff: true,
        startingPoint: false,
      },
    },
    {
      name: 'boundary on the head commit is never included',
      ahead: 5,
      behind: 12,
      boundary: commit('h'),
      want: {
        shape: 'diverged',
        mode: 'since',
        dropMode: false,
        toggle: true,
        diff: true,
        startingPoint: false,
      },
    },
  ]
  for (const c of cases) {
    const got = compareView(
      { ahead: c.ahead, behind: c.behind, head: 'h', boundary: c.boundary },
      c.mode,
    )
    expect(got, c.name).toEqual(c.want)
  }
})
