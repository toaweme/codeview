import { describe, expect, test } from 'vitest'
import { pruneRecents, pushRecent } from './recents'

describe('pushRecent', () => {
  const cases: { name: string; list: string[]; add: string; want: string[] }[] =
    [
      { name: 'first entry', list: [], add: 'a', want: ['a'] },
      {
        name: 'new goes first',
        list: ['a', 'b'],
        add: 'c',
        want: ['c', 'a', 'b'],
      },
      {
        name: 'existing moves up',
        list: ['a', 'b', 'c'],
        add: 'c',
        want: ['c', 'a', 'b'],
      },
      {
        name: 'caps at five',
        list: ['a', 'b', 'c', 'd', 'e'],
        add: 'f',
        want: ['f', 'a', 'b', 'c', 'd'],
      },
    ]
  for (const c of cases) {
    test(c.name, () => {
      expect(pushRecent(c.list, c.add)).toEqual(c.want)
    })
  }
})

describe('pruneRecents', () => {
  const cases: {
    name: string
    list: string[]
    known: string[]
    want: string[]
  }[] = [
    {
      name: 'keeps known in order',
      list: ['b', 'a'],
      known: ['a', 'b'],
      want: ['b', 'a'],
    },
    {
      name: 'drops removed',
      list: ['b', 'gone', 'a'],
      known: ['a', 'b'],
      want: ['b', 'a'],
    },
    { name: 'nothing known', list: ['a'], known: [], want: [] },
  ]
  for (const c of cases) {
    test(c.name, () => {
      expect(pruneRecents(c.list, new Set(c.known))).toEqual(c.want)
    })
  }
})
