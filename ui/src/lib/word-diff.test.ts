import { describe, expect, test } from 'vitest'
import { type Range, splitByRanges, tokenize, wordDiff } from './word-diff'

function marked(text: string, ranges: Range[]): string[] {
  return ranges.map((r) => text.slice(r.start, r.end))
}

describe('tokenize', () => {
  test('words, spaces and punctuation', () => {
    expect(tokenize('foo(bar,  baz_1)')).toEqual([
      'foo',
      '(',
      'bar',
      ',',
      '  ',
      'baz_1',
      ')',
    ])
  })
  test('unicode letters stay one word', () => {
    expect(tokenize('ačiū x')).toEqual(['ačiū', ' ', 'x'])
  })
})

describe('wordDiff', () => {
  const cases: {
    name: string
    a: string
    b: string
    old: string[] | null
    new?: string[]
  }[] = [
    { name: 'identical', a: 'x := 1', b: 'x := 1', old: [], new: [] },
    {
      name: 'one word changed',
      a: 'return foo(a, b)',
      b: 'return bar(a, b)',
      old: ['foo'],
      new: ['bar'],
    },
    {
      name: 'insertion only',
      a: 'call(a)',
      b: 'call(a, b)',
      old: [],
      new: [', b'],
    },
    {
      name: 'adjacent changed tokens merge',
      a: 'x = ab(c)',
      b: 'x = d.e(c)',
      old: ['ab'],
      new: ['d.e'],
    },
    {
      name: 'rewritten line gets no marks',
      a: 'completely different',
      b: 'nothing alike here at all!',
      old: null,
    },
  ]
  for (const c of cases) {
    test(c.name, () => {
      const got = wordDiff(c.a, c.b)
      if (c.old === null) {
        expect(got).toBeNull()
        return
      }
      expect(got).not.toBeNull()
      if (!got) return
      expect(marked(c.a, got.old)).toEqual(c.old)
      expect(marked(c.b, got.new)).toEqual(c.new)
    })
  }

  test('huge lines are skipped', () => {
    const a = 'a '.repeat(1000)
    const b = 'b '.repeat(1000)
    expect(wordDiff(a, b)).toBeNull()
  })
})

describe('splitByRanges', () => {
  const toks = [
    { text: 'return', style: 'kw' },
    { text: ' ' },
    { text: 'foo', style: 'fn' },
    { text: '()' },
  ]
  const cases: { name: string; ranges: Range[]; want: [string, boolean][] }[] =
    [
      {
        name: 'no ranges',
        ranges: [],
        want: [
          ['return', false],
          [' ', false],
          ['foo', false],
          ['()', false],
        ],
      },
      {
        name: 'range inside one token',
        ranges: [{ start: 2, end: 4 }],
        want: [
          ['re', false],
          ['tu', true],
          ['rn', false],
          [' ', false],
          ['foo', false],
          ['()', false],
        ],
      },
      {
        name: 'range spans tokens',
        ranges: [{ start: 5, end: 9 }],
        want: [
          ['retur', false],
          ['n', true],
          [' ', true],
          ['fo', true],
          ['o', false],
          ['()', false],
        ],
      },
      {
        name: 'two ranges',
        ranges: [
          { start: 0, end: 1 },
          { start: 10, end: 12 },
        ],
        want: [
          ['r', true],
          ['eturn', false],
          [' ', false],
          ['foo', false],
          ['()', true],
        ],
      },
    ]
  for (const c of cases) {
    test(c.name, () => {
      const got = splitByRanges(toks, c.ranges)
      expect(got.map((s) => [s.text, s.mark])).toEqual(c.want)
    })
  }

  test('styles carry over', () => {
    const got = splitByRanges(toks, [{ start: 1, end: 2 }])
    expect(got.slice(0, 3).map((s) => s.style)).toEqual(['kw', 'kw', 'kw'])
  })
})
