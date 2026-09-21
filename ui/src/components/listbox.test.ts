import { describe, expect, test } from 'vitest'
import {
  filterOptions,
  groupRows,
  multiLabel,
  type NavAction,
  navigate,
  navKey,
  type Option,
  selectAll,
  toggleValue,
  typeahead,
} from './listbox'

const authors: Option[] = [
  { value: 'Ann Lee', label: 'Ann Lee', secondary: 'ann@example.com' },
  { value: 'Bob Stone', label: 'Bob Stone', secondary: 'bob@corp.io' },
  { value: 'Joanna', label: 'Joanna', secondary: 'jo@ann.dev' },
  { value: 'Rob', label: 'Rob', keywords: ['robert'] },
]

describe('filterOptions', () => {
  const cases: { name: string; query: string; want: string[] }[] = [
    {
      name: 'empty query keeps all',
      query: '',
      want: ['Ann Lee', 'Bob Stone', 'Joanna', 'Rob'],
    },
    {
      name: 'blank query keeps all',
      query: '   ',
      want: ['Ann Lee', 'Bob Stone', 'Joanna', 'Rob'],
    },
    {
      name: 'label prefix ranks first',
      query: 'ann',
      want: ['Ann Lee', 'Joanna'],
    },
    { name: 'case insensitive', query: 'BOB', want: ['Bob Stone'] },
    { name: 'matches email', query: 'corp.io', want: ['Bob Stone'] },
    { name: 'matches keywords', query: 'robert', want: ['Rob'] },
    { name: 'every word must match', query: 'ann lee', want: ['Ann Lee'] },
    { name: 'words across fields', query: 'bob corp', want: ['Bob Stone'] },
    { name: 'no match hides all', query: 'zed', want: [] },
  ]
  for (const c of cases)
    test(c.name, () => {
      expect(filterOptions(authors, c.query).map((o) => o.value)).toEqual(
        c.want,
      )
    })
})

describe('navigate', () => {
  const cases: {
    name: string
    active: number
    action: NavAction
    count: number
    want: number
  }[] = [
    {
      name: 'next from none',
      active: -1,
      action: { type: 'next' },
      count: 3,
      want: 0,
    },
    { name: 'next', active: 0, action: { type: 'next' }, count: 3, want: 1 },
    {
      name: 'next stops at end',
      active: 2,
      action: { type: 'next' },
      count: 3,
      want: 2,
    },
    {
      name: 'prev from none',
      active: -1,
      action: { type: 'prev' },
      count: 3,
      want: 2,
    },
    {
      name: 'prev stops at start',
      active: 0,
      action: { type: 'prev' },
      count: 3,
      want: 0,
    },
    { name: 'first', active: 2, action: { type: 'first' }, count: 3, want: 0 },
    { name: 'last', active: 0, action: { type: 'last' }, count: 3, want: 2 },
    {
      name: 'set clamps',
      active: 0,
      action: { type: 'set', index: 9 },
      count: 3,
      want: 2,
    },
    {
      name: 'reset to none',
      active: 2,
      action: { type: 'reset' },
      count: 3,
      want: -1,
    },
    {
      name: 'reset to index',
      active: 2,
      action: { type: 'reset', index: 0 },
      count: 3,
      want: 0,
    },
    {
      name: 'reset clamps to shrunk list',
      active: 2,
      action: { type: 'reset', index: 5 },
      count: 2,
      want: 1,
    },
    {
      name: 'empty list',
      active: 1,
      action: { type: 'next' },
      count: 0,
      want: -1,
    },
  ]
  for (const c of cases)
    test(c.name, () => {
      expect(navigate(c.active, c.action, c.count)).toBe(c.want)
    })
})

describe('typeahead', () => {
  const labels = ['Apple', 'Banana', 'Blueberry', 'Cherry', 'Bean']
  const cases: {
    name: string
    prefix: string
    active: number
    want: number
  }[] = [
    { name: 'first letter', prefix: 'b', active: -1, want: 1 },
    { name: 'letter moves past active', prefix: 'b', active: 1, want: 2 },
    { name: 'letter wraps', prefix: 'b', active: 4, want: 1 },
    { name: 'repeated letter cycles', prefix: 'bb', active: 2, want: 4 },
    { name: 'prefix keeps current match', prefix: 'bl', active: 2, want: 2 },
    { name: 'prefix narrows', prefix: 'be', active: 1, want: 4 },
    { name: 'case insensitive', prefix: 'CH', active: 0, want: 3 },
    { name: 'no match keeps active', prefix: 'z', active: 2, want: 2 },
    { name: 'empty prefix keeps active', prefix: '', active: 2, want: 2 },
  ]
  for (const c of cases)
    test(c.name, () => {
      expect(typeahead(labels, c.prefix, c.active)).toBe(c.want)
    })
})

describe('navKey', () => {
  const cases: { key: string; want: NavAction['type'] | null }[] = [
    { key: 'ArrowDown', want: 'next' },
    { key: 'ArrowUp', want: 'prev' },
    { key: 'Home', want: 'first' },
    { key: 'End', want: 'last' },
    { key: 'a', want: null },
    { key: 'Enter', want: null },
  ]
  for (const c of cases)
    test(c.key, () => {
      expect(navKey(c.key)?.type ?? null).toBe(c.want)
    })
})

const repos: Option[] = [
  { value: 'seed/chi', label: 'chi', group: 'seed' },
  { value: 'seed/cli', label: 'cli', group: 'seed' },
  { value: 'toaweme/http', label: 'http', group: 'toaweme' },
  { value: 'seed/log', label: 'log', group: 'seed' },
]

describe('toggleValue', () => {
  const cases: {
    name: string
    selected: string[]
    value: string
    want: string[]
  }[] = [
    { name: 'adds to none', selected: [], value: 'a', want: ['a'] },
    { name: 'adds at the end', selected: ['a'], value: 'b', want: ['a', 'b'] },
    { name: 'removes', selected: ['a', 'b'], value: 'a', want: ['b'] },
    { name: 'removes the last', selected: ['a'], value: 'a', want: [] },
  ]
  for (const c of cases)
    test(c.name, () => {
      expect(toggleValue(c.selected, c.value)).toEqual(c.want)
    })
})

describe('selectAll', () => {
  const cases: {
    name: string
    selected: string[]
    query: string
    want: string[]
  }[] = [
    {
      name: 'no filter picks every option',
      selected: [],
      query: '',
      want: ['seed/chi', 'seed/cli', 'toaweme/http', 'seed/log'],
    },
    {
      name: 'filter picks the matches only',
      selected: [],
      query: 'c',
      want: ['seed/chi', 'seed/cli'],
    },
    {
      name: 'keeps earlier picks without duplicates',
      selected: ['toaweme/http', 'seed/cli'],
      query: 'c',
      want: ['toaweme/http', 'seed/cli', 'seed/chi'],
    },
  ]
  for (const c of cases)
    test(c.name, () => {
      expect(selectAll(c.selected, filterOptions(repos, c.query))).toEqual(
        c.want,
      )
    })
})

describe('multiLabel', () => {
  const count = (n: number) => `${n} repositories`
  const cases: { name: string; selected: string[]; want: string }[] = [
    { name: 'none reads as all', selected: [], want: 'All repositories' },
    {
      name: 'every option reads as all',
      selected: repos.map((o) => o.value),
      want: 'All repositories',
    },
    { name: 'one reads as its label', selected: ['seed/cli'], want: 'cli' },
    {
      name: 'several read as a count',
      selected: ['seed/cli', 'seed/chi', 'seed/log'],
      want: '3 repositories',
    },
    {
      name: 'unknown values are ignored',
      selected: ['seed/cli', 'gone/repo'],
      want: 'cli',
    },
  ]
  for (const c of cases)
    test(c.name, () => {
      expect(multiLabel(c.selected, repos, 'All repositories', count)).toBe(
        c.want,
      )
    })
})

describe('groupRows', () => {
  test('gathers each group under one heading in first-seen order', () => {
    const { rows, order } = groupRows(repos)
    expect(
      rows.map((r) =>
        r.kind === 'head' ? `# ${r.label}` : `${r.index} ${r.option.value}`,
      ),
    ).toEqual([
      '# seed',
      '0 seed/chi',
      '1 seed/cli',
      '2 seed/log',
      '# toaweme',
      '3 toaweme/http',
    ])
    expect(order.map((o) => o.value)).toEqual([
      'seed/chi',
      'seed/cli',
      'seed/log',
      'toaweme/http',
    ])
  })
  test('ungrouped options get no headings', () => {
    const { rows } = groupRows(authors)
    expect(rows.every((r) => r.kind === 'row')).toBe(true)
    expect(rows).toHaveLength(authors.length)
  })
})
