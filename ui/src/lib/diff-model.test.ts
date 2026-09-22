import { describe, expect, test } from 'vitest'
import type { DiffLine, FileDiff } from '@/api/types'
import { buildRows, gapsFor, pairChanges, sideDocument } from './diff-model'

const ctx = (o: number, n: number, text = `c${n}`): DiffLine => ({
  type: 'context',
  old: o,
  new: n,
  text,
})
const del = (o: number, text = `d${o}`): DiffLine => ({
  type: 'del',
  old: o,
  new: 0,
  text,
})
const add = (n: number, text = `a${n}`): DiffLine => ({
  type: 'add',
  old: 0,
  new: n,
  text,
})

// hunks at new lines 5..7 and 20..22, one line added in the first
const file: FileDiff = {
  path: 'a.go',
  oldPath: 'a.go',
  status: 'modified',
  additions: 2,
  deletions: 1,
  binary: false,
  hunks: [
    {
      oldStart: 5,
      oldLines: 2,
      newStart: 5,
      newLines: 3,
      header: '@@ -5,2 +5,3 @@',
      lines: [ctx(5, 5), add(6), ctx(6, 7)],
    },
    {
      oldStart: 19,
      oldLines: 3,
      newStart: 20,
      newLines: 3,
      header: '@@ -19,3 +20,3 @@ func x()',
      lines: [ctx(19, 20), del(20), add(21), ctx(21, 22)],
    },
  ],
}

const none = {
  collapsed: new Set<number>(),
  expanded: new Set<string>(),
  fullText: new Map<number, string[]>(),
}

describe('gapsFor', () => {
  test('between hunks and trailing', () => {
    const g = gapsFor(file, 0)
    expect(g[0]).toEqual({ key: '0:0', start: 1, end: 4, oldOffset: 0 })
    expect(g[1]).toEqual({ key: '0:1', start: 8, end: 19, oldOffset: -1 })
    expect(g[2]).toEqual({ key: '0:2', start: 23, end: null, oldOffset: -1 })
  })
  test('no leading gap at line 1, no trailing gap at EOF', () => {
    const f: FileDiff = {
      ...file,
      hunks: [{ ...file.hunks[0], oldStart: 1, newStart: 1 }],
    }
    const g = gapsFor(f, 0, 3)
    expect(g[0]).toBeNull()
    expect(g[1]).toBeNull()
  })
})

describe('pairChanges', () => {
  test('pairs dels with following adds', () => {
    const d1 = del(1)
    const d2 = del(2)
    const a1 = add(1)
    const lines = [ctx(0, 0), d1, d2, a1, ctx(3, 2)]
    const p = pairChanges(lines)
    expect(p.get(d1)).toBe(a1)
    expect(p.get(a1)).toBe(d1)
    expect(p.has(d2)).toBe(false)
  })
})

describe('buildRows', () => {
  test('unified', () => {
    const r = buildRows([file], { mode: 'unified', ...none })
    expect(r.rows.map((x) => x.kind)).toEqual([
      'file',
      'hunk',
      'line',
      'line',
      'line',
      'hunk',
      'line',
      'line',
      'line',
      'line',
      'expand',
    ])
    expect(r.fileStarts).toEqual([0])
    const d = r.rows[7]
    expect(d.kind === 'line' && d.pair?.text).toBe('a21')
  })

  test('split pairs rows', () => {
    const r = buildRows([file], { mode: 'split', ...none })
    const split = r.rows.filter((x) => x.kind === 'split')
    expect(split).toHaveLength(6)
    const pair = split[4]
    expect(
      pair.kind === 'split' && [pair.left?.text, pair.right?.text],
    ).toEqual(['d20', 'a21'])
  })

  test('collapsed file is a header only', () => {
    const r = buildRows([file, file], {
      mode: 'unified',
      ...none,
      collapsed: new Set([0]),
    })
    expect(r.fileStarts).toEqual([0, 1])
    expect(r.fileOf[0]).toBe(0)
    expect(r.fileOf[1]).toBe(1)
  })

  test('expanded gap replaces the hunk header with context', () => {
    const text = Array.from({ length: 25 }, (_, i) => `L${i + 1}`)
    const r = buildRows([file], {
      mode: 'unified',
      ...none,
      expanded: new Set(['0:1', '0:2']),
      fullText: new Map([[0, text]]),
    })
    const ctxRows = r.rows.filter((x) => x.kind === 'ctx')
    // 8..19 between hunks plus 23..25 trailing
    expect(ctxRows).toHaveLength(15)
    const first = ctxRows[0]
    expect(first.kind === 'ctx' && [first.new, first.old, first.text]).toEqual([
      8,
      7,
      'L8',
    ])
    expect(r.rows.some((x) => x.kind === 'expand')).toBe(false)
    expect(r.rows.filter((x) => x.kind === 'hunk')).toHaveLength(1)
  })

  test('binary file gets a note', () => {
    const r = buildRows([{ ...file, binary: true, hunks: [] }], {
      mode: 'unified',
      ...none,
    })
    expect(r.rows.map((x) => x.kind)).toEqual(['file', 'note'])
  })
})

test('sideDocument', () => {
  const d = sideDocument(file, 'new')
  expect(d.text.split('\n')).toEqual(['c5', 'a6', 'c7', 'c20', 'a21', 'c22'])
  expect(d.index.get(21)).toBe(4)
  const o = sideDocument(file, 'old')
  expect(o.index.get(20)).toBe(3)
})
