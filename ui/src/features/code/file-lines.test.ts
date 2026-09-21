import { expect, test } from 'vitest'
import type { BlameRange } from '@/api/types'
import { mergeBlame, splitLines } from './file-lines'

const r = (start: number, end: number, hash: string): BlameRange => ({
  start,
  end,
  commit: {
    hash,
    subject: hash,
    author: { name: 'a', email: 'a@x', date: '2020-01-01T00:00:00Z' },
  },
})

test('mergeBlame joins adjacent ranges of one commit', () => {
  const got = mergeBlame([
    r(1, 1, 'a'),
    r(2, 2, 'a'),
    r(3, 4, 'b'),
    r(5, 5, 'a'),
  ])
  expect(got.map((x) => [x.start, x.end, x.commit.hash])).toEqual([
    [1, 2, 'a'],
    [3, 4, 'b'],
    [5, 5, 'a'],
  ])
})

test('splitLines drops the final newline only', () => {
  expect(splitLines('a\nb\n')).toEqual(['a', 'b'])
  expect(splitLines('a\n\n')).toEqual(['a', ''])
  expect(splitLines('')).toEqual([''])
})
