import { describe, expect, test } from 'vitest'
import {
  formatLineHash,
  parseLineHash,
  parseRepoPath,
  parseRepoSearch,
  type RepoView,
  repoHref,
  repoLink,
  repoPath,
  splitRevision,
} from './url'

describe('parseRepoPath', () => {
  const cases: [string, string, RepoView | null][] = [
    ['bare org', '', null],
    ['repo root', 'codeview', { kind: 'tree', ref: undefined, path: '' }],
    ['repo at ref', 'codeview@dev', { kind: 'tree', ref: 'dev', path: '' }],
    [
      'tree with slashy ref',
      'codeview@feature~x/tree/ui/src',
      { kind: 'tree', ref: 'feature/x', path: 'ui/src' },
    ],
    [
      'blob',
      'codeview@main/blob/a/b.go',
      { kind: 'blob', ref: 'main', path: 'a/b.go' },
    ],
    [
      'blame without ref',
      'codeview/blame/go.mod',
      { kind: 'blame', ref: undefined, path: 'go.mod' },
    ],
    [
      'commits for path',
      'codeview/commits@v1~2/cmd',
      { kind: 'commits', ref: 'v1/2', path: 'cmd' },
    ],
    [
      'commits no ref',
      'codeview/commits',
      { kind: 'commits', ref: undefined, path: '' },
    ],
    ['commit', 'codeview/commit/abc123', { kind: 'commit', hash: 'abc123' }],
    [
      'compare',
      'codeview/compare/main...feature~x',
      { kind: 'compare', base: 'main', head: 'feature/x' },
    ],
    ['branches', 'codeview/branches', { kind: 'branches' }],
    ['releases', 'codeview/releases', { kind: 'releases' }],
  ]
  for (const [name, splat, want] of cases) {
    test(name, () => {
      const got = parseRepoPath(
        `toaweme/${splat}`,
        new Set(['toaweme/codeview']),
      )
      if (want === null) {
        expect(got).toBeNull()
        return
      }
      expect(got).toEqual({ repo: 'toaweme/codeview', view: want })
    })
  }
})

describe('parseRepoPath names', () => {
  const known = new Set(['github.com/o/cli', 'seed/chi', 'seed', 'chi'])
  const cases: [string, string, ReadonlySet<string> | undefined, string][] = [
    ['host path', 'github.com/o/cli', known, 'github.com/o/cli'],
    [
      'host path with ref',
      'github.com/o/cli@dev/tree/a',
      known,
      'github.com/o/cli',
    ],
    ['nested wins over parent', 'seed/chi', known, 'seed/chi'],
    ['parent repo view', 'seed/blob/chi', known, 'seed'],
    ['single segment', 'chi', known, 'chi'],
    ['single segment at ref', 'chi@v1', known, 'chi'],
    ['unknown stops at action', 'a/b/c/blob/x.go', undefined, 'a/b/c'],
    ['unknown stops at ref', 'a/b/c@main/tree/x', undefined, 'a/b/c'],
  ]
  for (const [name, path, set, want] of cases) {
    test(name, () => expect(parseRepoPath(path, set)?.repo).toBe(want))
  }
  test('a group path names no repository', () => {
    expect(parseRepoPath('github.com/o', known)).toBeNull()
    expect(parseRepoPath('github.com/o')).toBeNull()
  })
})

test('repoLink splits the first segment into the org param', () => {
  expect(repoLink('chi', { kind: 'tree', path: '' }).params).toEqual({
    org: 'chi',
    _splat: '',
  })
  expect(
    repoLink('github.com/o/cli', { kind: 'blob', ref: 'main', path: 'a.go' })
      .params,
  ).toEqual({ org: 'github.com', _splat: 'o/cli@main/blob/a.go' })
})

describe('repoPath round trip', () => {
  const views: RepoView[] = [
    { kind: 'tree', path: '' },
    { kind: 'tree', ref: 'feature/x', path: 'a/b' },
    { kind: 'blob', ref: 'main', path: 'x.go' },
    { kind: 'blame', ref: 'main', path: 'x.go' },
    { kind: 'commits', ref: 'dev', path: 'cmd' },
    { kind: 'commit', hash: 'deadbeef' },
    { kind: 'compare', base: 'main', head: 'a/b' },
    { kind: 'compare', base: 'main~3', head: 'feature/x~2' },
    { kind: 'compare', base: 'abc^', head: 'v1.0.0^2' },
    { kind: 'compare', base: 'feature/x~~2^', head: 'a/b/c~1^2~3' },
    { kind: 'branches' },
    { kind: 'releases' },
  ]
  for (const v of views) {
    test(JSON.stringify(v), () => {
      for (const repo of ['toaweme/codeview', 'github.com/o/r', 'chi']) {
        const path = repoPath(repo, v)
        expect(parseRepoPath(path, new Set([repo]))).toEqual({ repo, view: v })
        // a bare name reads as a group until the repository list is known
        if (path !== repo) expect(parseRepoPath(path)?.view).toEqual(v)
      }
    })
  }
})

describe('compare revisions', () => {
  const cases: [string, string, string][] = [
    ['main~3', 'main~~3', 'main~~3'],
    ['feature/x~2', 'feature~x~~2', 'feature~x~~2'],
    ['abc^', 'abc^', 'abc%5E'],
    ['v1.0.0^2', 'v1.0.0^2', 'v1.0.0%5E2'],
  ]
  for (const [rev, splat, href] of cases) {
    test(rev, () => {
      const view: RepoView = { kind: 'compare', base: rev, head: 'main' }
      expect(repoPath('o/r', view)).toBe(`o/r/compare/${splat}...main`)
      expect(repoHref('o/r', view)).toBe(`/o/r/compare/${href}...main`)
      // the router hands the splat back percent-decoded
      const back = decodeURIComponent(repoHref('o/r', view).slice(1))
      expect(parseRepoPath(back)?.view).toEqual(view)
    })
  }
})

test('repoHref carries the compare mode', () => {
  const cases: [RepoView, string][] = [
    [{ kind: 'compare', base: 'v1', head: 'v2' }, '/o/r/compare/v1...v2'],
    [
      { kind: 'compare', base: 'v1', head: 'v2', mode: 'direct' },
      '/o/r/compare/v1...v2?mode=direct',
    ],
  ]
  for (const [view, want] of cases) expect(repoHref('o/r', view)).toBe(want)
})

test('parseRepoSearch keeps only known modes', () => {
  expect(parseRepoSearch({ mode: 'direct' })).toEqual({ mode: 'direct' })
  expect(parseRepoSearch({ mode: 'sideways' })).toEqual({})
  expect(parseRepoSearch({})).toEqual({})
})

test('repoHref encodes path segments', () => {
  expect(
    repoHref('o/r', { kind: 'blob', ref: 'main', path: 'a b/c#d.md' }),
  ).toBe('/o/r@main/blob/a%20b/c%23d.md')
})

describe('line hash', () => {
  const cases: [string, ReturnType<typeof parseLineHash>][] = [
    ['#L10', { start: 10, end: 10 }],
    ['L3-L7', { start: 3, end: 7 }],
    ['#L9-4', { start: 4, end: 9 }],
    ['#L0', null],
    ['#foo', null],
    ['', null],
  ]
  for (const [hash, want] of cases) {
    test(hash || 'empty', () => expect(parseLineHash(hash)).toEqual(want))
  }
  test('format', () => {
    expect(formatLineHash({ start: 2, end: 2 })).toBe('L2')
    expect(formatLineHash({ start: 2, end: 5 })).toBe('L2-L5')
    expect(formatLineHash(null)).toBe('')
  })
})

describe('splitRevision', () => {
  const cases: [string, string, string][] = [
    ['main', 'main', ''],
    ['main~3', 'main', '~3'],
    ['feature/x~2', 'feature/x', '~2'],
    ['abc1234^', 'abc1234', '^'],
    ['v1.2.0^2', 'v1.2.0', '^2'],
    ['main~2^2', 'main', '~2^2'],
    ['-x~1', '-x~1', ''],
    ['a..b^', 'a..b^', ''],
    ['main^{tree}', 'main^{tree}', ''],
    ['~1', '~1', ''],
  ]
  for (const [rev, name, suffix] of cases)
    test(rev, () => expect(splitRevision(rev)).toEqual({ name, suffix }))
})
