import { describe, expect, test } from 'vitest'
import {
  formatRepoFilter,
  parseOverviewSearch,
  parseRepoFilter,
} from './overview-nav'

describe('parseOverviewSearch', () => {
  const cases: {
    name: string
    search: Record<string, unknown>
    want: ReturnType<typeof parseOverviewSearch>
  }[] = [
    { name: 'plain url is the overview', search: {}, want: {} },
    { name: 'unknown tab is dropped', search: { view: 'x' }, want: {} },
    {
      name: 'repo filter needs a tab',
      search: { repos: 'seed/chi' },
      want: {},
    },
    {
      name: 'tab keeps its repo filter',
      search: { view: 'branches', repos: 'seed/chi,seed/cli' },
      want: { view: 'branches', repos: 'seed/chi,seed/cli' },
    },
    {
      name: 'empty repo filter is dropped',
      search: { view: 'activity', repos: ' , ' },
      want: { view: 'activity' },
    },
    {
      name: 'repo filter is tidied',
      search: { view: 'releases', repos: 'a/b, a/b,,c/d ' },
      want: { view: 'releases', repos: 'a/b,c/d' },
    },
  ]
  for (const c of cases)
    test(c.name, () => {
      expect(parseOverviewSearch(c.search)).toEqual(c.want)
    })
})

describe('repo filter round trip', () => {
  const cases: { name: string; repos: string[]; url?: string }[] = [
    { name: 'all repos leaves no param', repos: [] },
    { name: 'one repo', repos: ['seed/chi'], url: 'seed/chi' },
    {
      name: 'several keep their order',
      repos: ['seed/log', 'seed/chi', 'toaweme/http'],
      url: 'seed/log,seed/chi,toaweme/http',
    },
  ]
  for (const c of cases)
    test(c.name, () => {
      const url = formatRepoFilter(c.repos)
      expect(url).toBe(c.url)
      expect(parseRepoFilter(url)).toEqual(c.repos)
    })

  test('non-string param reads as all repos', () => {
    expect(parseRepoFilter(['seed/chi'])).toEqual([])
    expect(parseRepoFilter(undefined)).toEqual([])
  })
})
