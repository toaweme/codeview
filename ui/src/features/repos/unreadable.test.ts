import { describe, expect, test } from 'vitest'
import { allUnreadable, failedSummary, unreadableTitle } from './unreadable'

describe('unreadableTitle', () => {
  test.each([
    ['readable', { name: 'o/r' }, undefined],
    ['empty error', { name: 'o/r', error: '' }, undefined],
    [
      'unreadable',
      { name: 'o/r', error: 'repository could not be read' },
      "o/r couldn't be read. Details are in the server log.",
    ],
  ])('%s', (_, repo, want) => {
    expect(unreadableTitle(repo)).toBe(want)
  })
})

describe('failedSummary', () => {
  test.each([
    [1, "1 repository couldn't be read"],
    [2, "2 repositories couldn't be read"],
    [1200, "1,200 repositories couldn't be read"],
  ])('%d', (n, want) => {
    expect(failedSummary(n)).toBe(want)
  })
})

describe('allUnreadable', () => {
  test.each([
    ['none failed', 0, 0, false],
    ['some failed', 1, 3, false],
    ['all failed', 3, 3, true],
    ['scope unknown', 2, 0, true],
  ])('%s', (_, failed, scope, want) => {
    expect(allUnreadable(failed, scope)).toBe(want)
  })
})
