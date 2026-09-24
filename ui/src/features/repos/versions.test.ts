import { describe, expect, test } from 'vitest'
import {
  buildReleases,
  compareVersions,
  isBotBranch,
  splitTag,
} from './versions'

describe('splitTag', () => {
  const cases: [string, string, string, boolean][] = [
    ['v1.2.3', '', 'v1.2.3', true],
    ['1.2.3', '', '1.2.3', true],
    ['v0.4', '', 'v0.4', true],
    ['v1.0.0-rc.1', '', 'v1.0.0-rc.1', true],
    ['config/addons/yaml/v1.0.0', 'config/addons/yaml', 'v1.0.0', true],
    ['api/1.4.0', 'api', '1.4.0', true],
    ['release-candidate', '', 'release-candidate', false],
    ['config/addons/yaml', '', 'config/addons/yaml', false],
    ['v1', '', 'v1', false],
  ]
  for (const [name, prefix, version, isVersion] of cases) {
    test(name, () => {
      expect(splitTag(name)).toEqual({ prefix, version, isVersion })
    })
  }
})

describe('compareVersions', () => {
  test('sorts newest first with pre-releases after releases', () => {
    const list = ['v1.2.0', 'v1.10.0', 'v1.10.0-rc.1', 'v1.9.3', 'v2.0']
    expect(list.sort(compareVersions)).toEqual([
      'v2.0',
      'v1.10.0',
      'v1.10.0-rc.1',
      'v1.9.3',
      'v1.2.0',
    ])
  })
})

describe('buildReleases', () => {
  test('links each release to the previous one on its track', () => {
    const at = (d: number) => `2026-09-${String(d).padStart(2, '0')}T00:00:00Z`
    const got = buildReleases('o/r', [
      { name: 'v1.0.0', commit: 'a', updatedAt: at(1) },
      { name: 'mod/v0.1.0', commit: 'b', updatedAt: at(2) },
      { name: 'nightly', commit: 'c', updatedAt: at(3) },
      { name: 'v1.1.0', commit: 'd', updatedAt: at(4) },
      { name: 'mod/v0.2.0', commit: 'e', updatedAt: at(5) },
    ])
    expect(got.map((r) => [r.name, r.previous])).toEqual([
      ['mod/v0.2.0', 'mod/v0.1.0'],
      ['v1.1.0', 'v1.0.0'],
      ['nightly', ''],
      ['mod/v0.1.0', ''],
      ['v1.0.0', ''],
    ])
  })
})

describe('isBotBranch', () => {
  const cases: [string, boolean][] = [
    ['dependabot/npm/vite-6', true],
    ['renovate/react', true],
    ['copilot/fix-123', true],
    ['feature/renovate', false],
    ['main', false],
  ]
  for (const [name, want] of cases) {
    test(name, () => expect(isBotBranch(name)).toBe(want))
  }
})
