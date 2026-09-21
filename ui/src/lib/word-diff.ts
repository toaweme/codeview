// half-open [start, end)
export type Range = { start: number; end: number }

export type WordDiff = { old: Range[]; new: Range[] }

// caps the LCS table so huge minified lines cannot stall the main thread
const MAX_CELLS = 250_000

// below this shared fraction the lines count as rewritten and get no word marks
const MIN_SHARED = 0.4

export function tokenize(s: string): string[] {
  return s.match(/[\p{L}\p{N}_]+|\s+|[^\p{L}\p{N}_\s]/gu) ?? []
}

function lcs(a: string[], b: string[]): [boolean[], boolean[]] {
  const n = a.length
  const m = b.length
  const w = m + 1
  const t = new Uint32Array((n + 1) * w)
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      t[i * w + j] =
        a[i] === b[j]
          ? t[(i + 1) * w + j + 1] + 1
          : Math.max(t[(i + 1) * w + j], t[i * w + j + 1])
    }
  }
  const keepA = new Array<boolean>(n).fill(false)
  const keepB = new Array<boolean>(m).fill(false)
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      keepA[i] = true
      keepB[j] = true
      i++
      j++
    } else if (t[(i + 1) * w + j] >= t[i * w + j + 1]) {
      i++
    } else {
      j++
    }
  }
  return [keepA, keepB]
}

function toRanges(tokens: string[], keep: boolean[]): Range[] {
  const out: Range[] = []
  let pos = 0
  for (let i = 0; i < tokens.length; i++) {
    const len = tokens[i].length
    if (!keep[i]) {
      const last = out[out.length - 1]
      if (last && last.end === pos) last.end = pos + len
      else out.push({ start: pos, end: pos + len })
    }
    pos += len
  }
  return out
}

function sharedChars(tokens: string[], keep: boolean[]): number {
  let n = 0
  for (let i = 0; i < tokens.length; i++) if (keep[i]) n += tokens[i].length
  return n
}

export function wordDiff(oldText: string, newText: string): WordDiff | null {
  if (oldText === newText) return { old: [], new: [] }
  const a = tokenize(oldText)
  const b = tokenize(newText)
  if ((a.length + 1) * (b.length + 1) > MAX_CELLS) return null
  const [keepA, keepB] = lcs(a, b)
  const shared = sharedChars(a, keepA)
  const longest = Math.max(oldText.length, newText.length)
  if (longest > 0 && shared / longest < MIN_SHARED) return null
  return { old: toRanges(a, keepA), new: toRanges(b, keepB) }
}

export type Segment<S> = { text: string; style?: S; mark: boolean }

// ranges must be sorted and non-overlapping
export function splitByRanges<S>(
  tokens: readonly { text: string; style?: S }[],
  ranges: readonly Range[],
): Segment<S>[] {
  const out: Segment<S>[] = []
  let pos = 0
  let r = 0
  for (const tok of tokens) {
    let start = 0
    const len = tok.text.length
    while (start < len) {
      const abs = pos + start
      while (r < ranges.length && ranges[r].end <= abs) r++
      const range = ranges[r]
      let mark = false
      let cut = len
      if (range) {
        if (abs >= range.start) {
          mark = true
          cut = Math.min(len, range.end - pos)
        } else {
          cut = Math.min(len, range.start - pos)
        }
      }
      out.push({ text: tok.text.slice(start, cut), style: tok.style, mark })
      start = cut
    }
    pos += len
  }
  return out
}
