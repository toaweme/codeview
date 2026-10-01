import { describe, expect, test } from 'vitest'
import { buildLabel } from './build-label'

describe('buildLabel', () => {
  test.each([
    ['release', 'v1.2.0', 'abcdef0123456', 'v1.2.0 (abcdef0)'],
    ['release without commit', 'v1.2.0', '', 'v1.2.0'],
    ['unset', undefined, undefined, 'dev'],
    ['dev', 'dev', '', 'dev'],
    ['dev with commit', 'dev', 'abcdef0123456', 'dev (abcdef0)'],
  ])('%s', (_, version, commit, want) => {
    expect(buildLabel(version, commit)).toBe(want)
  })
})
