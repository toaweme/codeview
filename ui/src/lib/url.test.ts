import { describe, expect, test } from 'vitest'
import {
  formatLineHash,
  parseLineHash,
  parseRepoPath,
  parseRepoSearch,
  type RepoView,
  repoHref,
  repoPermalink,
  repoSplat,
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
      const got = parseRepoPath('toaweme', splat)
      if (want === null) {
        expect(got).toBeNull()
        return
      }
      expect(got).toEqual({ repo: 'toaweme/codeview', view: want })
    })
  }
})

describe('repoSplat round trip', () => {
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
      const splat = repoSplat('toaweme/codeview', v)
      expect(parseRepoPath('toaweme', splat)?.view).toEqual(v)
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
      expect(repoSplat('o/r', view)).toBe(`r/compare/${splat}...main`)
      expect(repoHref('o/r', view)).toBe(`/o/r/compare/${href}...main`)
      // the router hands the splat back percent-decoded
      const back = decodeURIComponent(repoHref('o/r', view).slice(3))
      expect(parseRepoPath('o', back)?.view).toEqual(view)
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

describe('repoPermalink', () => {
  const at = 'http://h:1'
  const sha = 'abc123def456abc123def456abc123def456abcd'
  const cases: [string, string, RepoView, string | undefined, string][] = [
    [
      'blob keeps the line hash',
      `${at}/o/r/blob/src/a.ts#L3-L5`,
      { kind: 'blob', path: 'src/a.ts' },
      sha,
      `${at}/o/r@${sha}/blob/src/a.ts#L3-L5`,
    ],
    [
      'blame on a branch',
      `${at}/o/r@dev/blame/a.ts`,
      { kind: 'blame', ref: 'dev', path: 'a.ts' },
      sha,
      `${at}/o/r@${sha}/blame/a.ts`,
    ],
    [
      'repo root',
      `${at}/o/r`,
      { kind: 'tree', path: '' },
      sha,
      `${at}/o/r@${sha}`,
    ],
    [
      'commits keeps the query',
      `${at}/o/r/commits/a?author=x`,
      { kind: 'commits', path: 'a' },
      sha,
      `${at}/o/r/commits@${sha}/a?author=x`,
    ],
    [
      'no commit leaves the url',
      `${at}/o/r@dev/tree/a`,
      { kind: 'tree', ref: 'dev', path: 'a' },
      undefined,
      `${at}/o/r@dev/tree/a`,
    ],
    [
      'compare leaves the url',
      `${at}/o/r/compare/a...b?mode=direct`,
      { kind: 'compare', base: 'a', head: 'b', mode: 'direct' },
      sha,
      `${at}/o/r/compare/a...b?mode=direct`,
    ],
    [
      'commit page leaves the url',
      `${at}/o/r/commit/${sha}`,
      { kind: 'commit', hash: sha },
      sha,
      `${at}/o/r/commit/${sha}`,
    ],
  ]
  for (const [name, href, view, commit, want] of cases) {
    test(name, () =>
      expect(repoPermalink(href, 'o/r', view, commit)).toBe(want),
    )
  }
})
