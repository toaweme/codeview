import { expect, test } from 'vitest'
import { longestCandidates } from './measure'

test('longestCandidates keeps everything for short files', () => {
  expect(longestCandidates(['a', 'bb', 'c'], 5)).toEqual([0, 1, 2])
})

test('longestCandidates picks the longest lines', () => {
  const lines = ['x', 'xxxxx', 'xx', 'xxxx', 'xxx', 'x']
  expect(longestCandidates(lines, 2)).toEqual([1, 3])
})
