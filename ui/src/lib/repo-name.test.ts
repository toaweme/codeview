import { describe, expect, test } from 'vitest'
import {
  groupRepos,
  repoBase,
  repoNames,
  repoParent,
  sharedHost,
  shiftPositions,
} from './repo-name'

describe('repoParent and repoBase', () => {
  const cases: [string, string, string][] = [
    ['github.com/toaweme/cli', 'github.com/toaweme', 'cli'],
    ['seed/chi', 'seed', 'chi'],
    ['chi', '', 'chi'],
  ]
  for (const [name, parent, base] of cases) {
    test(name, () => {
      expect(repoParent(name)).toBe(parent)
      expect(repoBase(name)).toBe(base)
    })
  }
})

describe('sharedHost', () => {
  const cases: [string, string[], string][] = [
    ['one host', ['github.com/a/x', 'github.com/b/y'], 'github.com'],
    ['mixed hosts', ['github.com/a/x', 'gitlab.com/b/y'], ''],
    ['no dot', ['seed/chi', 'seed/mux'], ''],
    ['bare host name', ['github.com', 'github.com/a/x'], ''],
    ['empty', [], ''],
  ]
  for (const [name, names, want] of cases) {
    test(name, () => expect(sharedHost(names)).toBe(want))
  }
})

test('repoNames hides the shared host', () => {
  const n = repoNames(['github.com/toaweme/cli', 'github.com/toaweme/http'])
  expect(n.display('github.com/toaweme/cli')).toBe('toaweme/cli')
  expect(n.display('github.com/toaweme')).toBe('toaweme')
  expect(repoNames(['seed/chi', 'chi']).display('seed/chi')).toBe('seed/chi')
})

test('shiftPositions drops positions cut off the front', () => {
  expect(shiftPositions([0, 3, 12], 11)).toEqual([1])
  expect(shiftPositions([0, 3], 0)).toEqual([0, 3])
})

test('groupRepos sections by parent with bare names last', () => {
  const got = groupRepos(
    ['chi', 'b/y', 'a/z', 'a/x', 'h.com/o/r'].map((name) => ({ name })),
  ).map((g) => [g.parent, g.repos.map((r) => r.name)])
  expect(got).toEqual([
    ['a', ['a/z', 'a/x']],
    ['b', ['b/y']],
    ['h.com/o', ['h.com/o/r']],
    ['', ['chi']],
  ])
})
