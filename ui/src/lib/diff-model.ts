import type { DiffLine, FileDiff } from '@/api/types'

export type DiffMode = 'unified' | 'split'

// new-file line numbers, inclusive. end is null on the trailing gap until the file is fetched
export type Gap = {
  key: string
  start: number
  end: number | null
  oldOffset: number
}

export type Row =
  | { kind: 'file'; file: number }
  | {
      kind: 'hunk'
      file: number
      hunk: number
      header: string
      gap: Gap | null
    }
  | { kind: 'line'; file: number; line: DiffLine; pair?: DiffLine }
  | { kind: 'split'; file: number; left?: DiffLine; right?: DiffLine }
  | { kind: 'ctx'; file: number; old: number; new: number; text: string }
  | { kind: 'expand'; file: number; gap: Gap }
  | { kind: 'note'; file: number; text: string }

export type BuildOptions = {
  mode: DiffMode
  collapsed: ReadonlySet<number>
  expanded: ReadonlySet<string>
  fullText: ReadonlyMap<number, readonly string[]>
}

export type Rows = {
  rows: Row[]
  fileStarts: number[]
  fileOf: Int32Array
}

export function gapKey(file: number, index: number): string {
  return `${file}:${index}`
}

// empty leading gaps come back as null
export function gapsFor(
  f: FileDiff,
  file: number,
  totalLines?: number,
): (Gap | null)[] {
  const out: (Gap | null)[] = []
  let nextNew = 1
  let nextOld = 1
  f.hunks.forEach((h, i) => {
    const end = h.new_start - 1
    out.push(
      end >= nextNew
        ? {
            key: gapKey(file, i),
            start: nextNew,
            end,
            oldOffset: h.old_start - h.new_start,
          }
        : null,
    )
    nextNew = h.new_start + h.new_lines
    nextOld = h.old_start + h.old_lines
  })
  const trailingEnd = totalLines ?? null
  if (f.hunks.length > 0 && (trailingEnd === null || trailingEnd >= nextNew)) {
    out.push({
      key: gapKey(file, f.hunks.length),
      start: nextNew,
      end: trailingEnd,
      oldOffset: nextOld - nextNew,
    })
  } else {
    out.push(null)
  }
  return out
}

export function pairChanges(
  lines: readonly DiffLine[],
): Map<DiffLine, DiffLine> {
  const pairs = new Map<DiffLine, DiffLine>()
  let i = 0
  while (i < lines.length) {
    if (lines[i].type !== 'del') {
      i++
      continue
    }
    const dels: DiffLine[] = []
    while (i < lines.length && lines[i].type === 'del') dels.push(lines[i++])
    const adds: DiffLine[] = []
    while (i < lines.length && lines[i].type === 'add') adds.push(lines[i++])
    const n = Math.min(dels.length, adds.length)
    for (let k = 0; k < n; k++) {
      pairs.set(dels[k], adds[k])
      pairs.set(adds[k], dels[k])
    }
  }
  return pairs
}

function splitRows(file: number, lines: readonly DiffLine[]): Row[] {
  const out: Row[] = []
  let i = 0
  while (i < lines.length) {
    const l = lines[i]
    if (l.type === 'context') {
      out.push({ kind: 'split', file, left: l, right: l })
      i++
      continue
    }
    const dels: DiffLine[] = []
    while (i < lines.length && lines[i].type === 'del') dels.push(lines[i++])
    const adds: DiffLine[] = []
    while (i < lines.length && lines[i].type === 'add') adds.push(lines[i++])
    const n = Math.max(dels.length, adds.length)
    for (let k = 0; k < n; k++) {
      out.push({ kind: 'split', file, left: dels[k], right: adds[k] })
    }
  }
  return out
}

function contextRows(file: number, gap: Gap, text: readonly string[]): Row[] {
  const end = Math.min(gap.end ?? text.length, text.length)
  const out: Row[] = []
  for (let n = gap.start; n <= end; n++) {
    out.push({
      kind: 'ctx',
      file,
      new: n,
      old: n + gap.oldOffset,
      text: text[n - 1] ?? '',
    })
  }
  return out
}

export function fileNote(f: FileDiff): string | null {
  if (f.binary) return 'Binary file not shown.'
  if (f.hunks.length === 0) {
    if (f.status === 'renamed' || f.status === 'copied')
      return 'File moved without changes.'
    return 'No content changes.'
  }
  if (f.truncated) return null
  return null
}

export function buildRows(
  files: readonly FileDiff[],
  opts: BuildOptions,
): Rows {
  const rows: Row[] = []
  const fileStarts: number[] = []
  const fileOf: number[] = []
  const push = (r: Row) => {
    rows.push(r)
    fileOf.push(r.file)
  }

  files.forEach((f, fi) => {
    fileStarts.push(rows.length)
    push({ kind: 'file', file: fi })
    if (opts.collapsed.has(fi)) return
    const note = fileNote(f)
    if (note) {
      push({ kind: 'note', file: fi, text: note })
      return
    }
    const text = opts.fullText.get(fi)
    const gaps = gapsFor(f, fi, text?.length)
    const pairs =
      opts.mode === 'unified'
        ? pairChanges(f.hunks.flatMap((h) => h.lines))
        : null

    f.hunks.forEach((h, hi) => {
      const gap = gaps[hi]
      if (gap && text && opts.expanded.has(gap.key)) {
        for (const r of contextRows(fi, gap, text)) push(r)
      } else {
        push({ kind: 'hunk', file: fi, hunk: hi, header: h.header, gap })
      }
      if (opts.mode === 'split') {
        for (const r of splitRows(fi, h.lines)) push(r)
      } else {
        for (const l of h.lines)
          push({ kind: 'line', file: fi, line: l, pair: pairs?.get(l) })
      }
    })

    const trailing = gaps[f.hunks.length]
    if (trailing && f.status !== 'deleted') {
      if (text && opts.expanded.has(trailing.key)) {
        for (const r of contextRows(fi, trailing, text)) push(r)
      } else {
        push({ kind: 'expand', file: fi, gap: trailing })
      }
    }
    if (f.truncated)
      push({
        kind: 'note',
        file: fi,
        text: 'Diff truncated. The rest of this file is too large to show.',
      })
  })

  return { rows, fileStarts, fileOf: Int32Array.from(fileOf) }
}

export function sideDocument(
  f: FileDiff,
  side: 'old' | 'new',
): { text: string; index: Map<number, number> } {
  const lines: string[] = []
  const index = new Map<number, number>()
  for (const h of f.hunks) {
    for (const l of h.lines) {
      if (side === 'old' && l.type === 'add') continue
      if (side === 'new' && l.type === 'del') continue
      const n = side === 'old' ? l.old : l.new
      if (n !== null) index.set(n, lines.length)
      lines.push(l.text)
    }
  }
  return { text: lines.join('\n'), index }
}
