// a term matches as a substring or as runs that each start a word or span two
// characters, so a scattered subsequence in a long path is excluded outright

const BASE = 16
const CONSECUTIVE = 6
const GAP_START = 3
const GAP_EXTEND = 1
const BONUS_SEGMENT = 10
const BONUS_WORD = 8
const BONUS_CAMEL = 7
const BONUS_BASENAME = 3
const BONUS_CASE = 1
const NEG = -1e9

export type FuzzyMatch = {
  score: number
  positions: number[]
}

function lower(c: number): number {
  return c >= 65 && c <= 90 ? c + 32 : c
}

function isLower(c: number): boolean {
  return c >= 97 && c <= 122
}

function isUpper(c: number): boolean {
  return c >= 65 && c <= 90
}

function isDigit(c: number): boolean {
  return c >= 48 && c <= 57
}

function bonusAt(text: string, j: number): number {
  if (j === 0) return BONUS_SEGMENT
  const prev = text.charCodeAt(j - 1)
  const cur = text.charCodeAt(j)
  if (prev === 47) return BONUS_SEGMENT // '/'
  if (prev === 95 || prev === 45 || prev === 46 || prev === 32)
    return BONUS_WORD // '_' '-' '.' ' '
  if (isLower(prev) && isUpper(cur)) return BONUS_CAMEL
  if (!isDigit(prev) && isDigit(cur)) return BONUS_WORD / 2
  return 0
}

function isSubsequence(q: string, text: string): boolean {
  let i = 0
  for (let j = 0; j < text.length && i < q.length; j++) {
    if (lower(text.charCodeAt(j)) === lower(q.charCodeAt(i))) i++
  }
  return i === q.length
}

function coherent(text: string, positions: readonly number[]): boolean {
  let i = 0
  while (i < positions.length) {
    let j = i
    while (j + 1 < positions.length && positions[j + 1] === positions[j] + 1)
      j++
    if (j === i && bonusAt(text, positions[i]) === 0) return false
    i = j + 1
  }
  return true
}

function matchTerm(q: string, text: string, withPositions: boolean) {
  const n = q.length
  const m = text.length
  if (n === 0) return { score: 0, positions: [] as number[] }
  if (n > m || !isSubsequence(q, text)) return null

  const base = text.lastIndexOf('/') + 1
  const bonus = new Float64Array(m)
  for (let j = 0; j < m; j++) {
    bonus[j] = bonusAt(text, j) + (j >= base ? BONUS_BASENAME : 0)
  }

  let prevRow = new Float64Array(m).fill(NEG)
  let row = new Float64Array(m).fill(NEG)
  // back[i*m+j] is the column the previous query char matched at
  const back = new Int32Array(n * m).fill(-1)

  for (let i = 0; i < n; i++) {
    const qc = q.charCodeAt(i)
    const ql = lower(qc)
    row.fill(NEG)
    // best score of the previous row at least two columns back, gap already charged
    let gap = NEG
    let gapFrom = -1
    for (let j = 0; j < m; j++) {
      if (i > 0 && j >= 2) {
        const extended = gap - GAP_EXTEND
        const opened = prevRow[j - 2] - GAP_START
        if (opened >= extended) {
          gap = opened
          gapFrom = j - 2
        } else {
          gap = extended
        }
      }
      const tc = text.charCodeAt(j)
      if (lower(tc) !== ql) continue
      const own = BASE + bonus[j] + (tc === qc ? BONUS_CASE : 0)
      if (i === 0) {
        row[j] = own
        continue
      }
      const consec = j >= 1 ? prevRow[j - 1] + CONSECUTIVE : NEG
      let best = NEG
      let from = -1
      if (consec > NEG / 2 && consec >= gap) {
        best = consec
        from = j - 1
      } else if (gap > NEG / 2) {
        best = gap
        from = gapFrom
      }
      if (from < 0) continue
      row[j] = best + own
      back[i * m + j] = from
    }
    const t = prevRow
    prevRow = row
    row = t
  }

  let score = NEG
  let end = -1
  for (let j = 0; j < m; j++) {
    if (prevRow[j] > score) {
      score = prevRow[j]
      end = j
    }
  }
  if (end < 0) return null

  const positions: number[] = []
  let j = end
  for (let i = n - 1; i >= 0 && j >= 0; i--) {
    positions.push(j)
    j = i > 0 ? back[i * m + j] : -1
  }
  positions.reverse()
  if (
    !coherent(text, positions) &&
    !text.toLowerCase().includes(q.toLowerCase())
  )
    return null
  return { score, positions: withPositions ? positions : [] }
}

export function fuzzyMatch(
  query: string,
  text: string,
  withPositions = true,
): FuzzyMatch | null {
  const terms = query.split(/\s+/).filter(Boolean)
  let score = 0
  const positions = new Set<number>()
  for (const term of terms) {
    const r = matchTerm(term, text, withPositions)
    if (!r) return null
    score += r.score
    for (const p of r.positions) positions.add(p)
  }
  // shorter paths win ties
  score -= text.length * 0.05
  return { score, positions: [...positions].sort((a, b) => a - b) }
}

export type Ranked = { path: string; score: number; positions: number[] }

export function rankPaths(
  query: string,
  paths: readonly string[],
  limit = 50,
): Ranked[] {
  if (!query.trim()) {
    return paths
      .slice(0, limit)
      .map((path) => ({ path, score: 0, positions: [] }))
  }
  const scored: { path: string; score: number }[] = []
  for (const path of paths) {
    const r = fuzzyMatch(query, path, false)
    if (r) scored.push({ path, score: r.score })
  }
  scored.sort(
    (a, b) =>
      b.score - a.score ||
      a.path.length - b.path.length ||
      (a.path < b.path ? -1 : 1),
  )
  return scored.slice(0, limit).map(({ path, score }) => ({
    path,
    score,
    positions: fuzzyMatch(query, path, true)?.positions ?? [],
  }))
}
