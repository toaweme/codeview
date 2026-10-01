import { describe, expect, test } from 'vitest'
import { NOT_FOUND_TITLE, pageTitle, type TitleExtra } from './title'
import { parseRepoPath } from './url'

describe('pageTitle', () => {
  const known = new Set(['github.com/toaweme/http', 'chi'])
  const cases: [string, string, TitleExtra, string][] = [
    ['dashboard', '', {}, 'Dashboard - Codeview'],
    ['dashboard tab', '', { tab: 'Activity' }, 'Activity - Codeview'],
    ['group', 'github.com/toaweme', {}, 'toaweme - Codeview'],
    [
      'group tab',
      'github.com/toaweme',
      { tab: 'Releases' },
      'Releases - toaweme - Codeview',
    ],
    ['repo root', 'github.com/toaweme/http', {}, 'http - toaweme - Codeview'],
    [
      'repo at ref',
      'github.com/toaweme/http@main',
      {},
      'http - toaweme - Codeview',
    ],
    [
      'repo ignores tab',
      'github.com/toaweme/http',
      { tab: 'Activity' },
      'http - toaweme - Codeview',
    ],
    ['bare repo', 'chi', {}, 'chi - Codeview'],
    ['tree path', 'chi/tree/internal/server', {}, 'server/ - chi - Codeview'],
    ['blob', 'chi/blob/internal/server.go', {}, 'server.go - chi - Codeview'],
    ['blame', 'chi@v1/blame/README.md', {}, 'README.md - chi - Codeview'],
    ['commits', 'chi/commits@main/internal', {}, 'Commits - chi - Codeview'],
    ['commit loading', 'chi/commit/a1b2c3d4e5', {}, 'a1b2c3d - chi - Codeview'],
    [
      'commit loaded',
      'chi/commit/a1b2c3d4e5',
      { subject: 'fix: retry on 502' },
      'a1b2c3d fix: retry on 502 - chi - Codeview',
    ],
    [
      'compare',
      'chi/compare/main...feat~x',
      {},
      'main...feat/x - chi - Codeview',
    ],
    [
      'compare without head',
      'chi/compare/main',
      {},
      'Compare - chi - Codeview',
    ],
    ['branches', 'chi/branches', {}, 'Branches - chi - Codeview'],
    ['releases', 'chi/releases', {}, 'Releases - chi - Codeview'],
  ]
  for (const [name, path, extra, want] of cases) {
    test(name, () => {
      expect(pageTitle(path, parseRepoPath(path, known), extra)).toBe(want)
    })
  }

  test('compare direct', () => {
    const loc = parseRepoPath('chi/compare/main...feat', known)
    if (loc?.view.kind === 'compare') loc.view.mode = 'direct'
    expect(pageTitle('chi/compare/main...feat', loc)).toBe(
      'main..feat - chi - Codeview',
    )
  })

  test('not found', () => expect(NOT_FOUND_TITLE).toBe('Not found - Codeview'))
})
