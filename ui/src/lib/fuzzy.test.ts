import { describe, expect, test } from 'vitest'
import { fuzzyMatch, rankPaths } from './fuzzy'

describe('fuzzyMatch', () => {
  const cases: {
    name: string
    query: string
    text: string
    match: boolean
    positions?: number[]
  }[] = [
    { name: 'no match', query: 'xyz', text: 'abc', match: false },
    { name: 'out of order', query: 'ba', text: 'ab', match: false },
    { name: 'empty query', query: '', text: 'abc', match: true, positions: [] },
    {
      name: 'case insensitive',
      query: 'READ',
      text: 'readme.md',
      match: true,
      positions: [0, 1, 2, 3],
    },
    {
      name: 'prefers segment start',
      query: 'mgo',
      text: 'cmd/main.go',
      match: true,
      positions: [4, 9, 10],
    },
    {
      name: 'terms are anded',
      query: 'ui route',
      text: 'ui/src/routes/index.tsx',
      match: true,
      positions: [0, 1, 7, 8, 9, 10, 11],
    },
    { name: 'missing term', query: 'ui zzz', text: 'ui/src', match: false },
    { name: 'longer than text', query: 'abcd', text: 'abc', match: false },
    {
      name: 'scattered mid-word letters excluded',
      query: 'mn',
      text: 'main',
      match: false,
    },
    {
      name: 'scattered across a long path excluded',
      query: 'sre',
      text: 'features/shell/app-shell.tsx',
      match: false,
    },
    { name: 'substring kept', query: 'ai', text: 'main', match: true },
    {
      name: 'word starts kept',
      query: 'fv',
      text: 'file-view.tsx',
      match: true,
    },
  ]
  for (const c of cases) {
    test(c.name, () => {
      const r = fuzzyMatch(c.query, c.text)
      if (!c.match) {
        expect(r).toBeNull()
        return
      }
      expect(r).not.toBeNull()
      if (c.positions) expect(r?.positions).toEqual(c.positions)
    })
  }
})

describe('rankPaths', () => {
  const cases: {
    name: string
    query: string
    paths: string[]
    first: string
  }[] = [
    {
      name: 'file name beats substring',
      query: 'api',
      paths: ['src/lib/rapid.ts', 'src/api/client.ts', 'api.go'],
      first: 'api.go',
    },
    {
      name: 'camel humps',
      query: 'fb',
      paths: ['src/fileb.ts', 'src/FooBar.ts'],
      first: 'src/FooBar.ts',
    },
    {
      name: 'basename over directory',
      query: 'tree',
      paths: ['tree/a/b/c/x.go', 'src/components/tree.tsx'],
      first: 'src/components/tree.tsx',
    },
    {
      name: 'consecutive run wins',
      query: 'main',
      paths: ['m/a/i/n.go', 'cmd/main.go'],
      first: 'cmd/main.go',
    },
    {
      name: 'shorter path breaks ties',
      query: 'go.mod',
      paths: ['vendor/x/go.mod', 'go.mod'],
      first: 'go.mod',
    },
  ]
  for (const c of cases) {
    test(c.name, () => {
      expect(rankPaths(c.query, c.paths)[0]?.path).toBe(c.first)
    })
  }

  test('limit and filtering', () => {
    const got = rankPaths('a', ['a', 'b', 'ab', 'ba'], 2)
    expect(got).toHaveLength(2)
    expect(got.every((r) => r.path.includes('a'))).toBe(true)
  })

  test('no match excluded', () => {
    const got = rankPaths('codeview', [
      'toaweme/codeview',
      'toaweme/goimports-reviser',
      'awee-ai/log',
    ]).map((r) => r.path)
    expect(got).toEqual(['toaweme/codeview'])
    expect(rankPaths('zzz', ['a', 'b'])).toEqual([])
  })

  test('empty query keeps order', () => {
    expect(rankPaths(' ', ['z', 'y'], 5).map((r) => r.path)).toEqual(['z', 'y'])
  })
})
