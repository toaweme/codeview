import { addDays, type DateRange, parseISODate, toISODate } from './filters'

export type DayOrder = 'dmy' | 'mdy' | 'ymd'

export type Span = Required<DateRange>

export type ParsedInput =
  | { kind: 'empty' }
  | { kind: 'invalid' }
  | { kind: 'span'; span: Span; range: boolean }

export function localeOrder(locale?: string): DayOrder {
  const parts = new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(2026, 10, 22))
  const order = parts
    .map((p) => p.type)
    .filter((t) => t === 'day' || t === 'month' || t === 'year')
    .map((t) => t[0])
    .join('')
  return order === 'mdy' || order === 'ymd' ? order : 'dmy'
}

function day(y: number, m: number, d: number): string | null {
  const s = `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  return parseISODate(s) ? s : null
}

function one(d: string | null): Span | null {
  return d ? { since: d, until: d } : null
}

function month(y: number, m: number): Span | null {
  if (m < 1 || m > 12) return null
  const first = new Date(y, m - 1, 1)
  const last = new Date(y, m, 0)
  return { since: toISODate(first), until: toISODate(last) }
}

function ago(n: number, unit: string, now: Date): string {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  if (unit === 'd') return toISODate(addDays(today, -n))
  if (unit === 'w') return toISODate(addDays(today, -7 * n))
  const months = unit === 'm' ? n : 12 * n
  const target = new Date(today.getFullYear(), today.getMonth() - months, 1)
  const lastDay = new Date(
    target.getFullYear(),
    target.getMonth() + 1,
    0,
  ).getDate()
  target.setDate(Math.min(today.getDate(), lastDay))
  return toISODate(target)
}

// ambiguous numeric dates use the locale order, and the other only when that is impossible
function parseOne(text: string, now: Date, order: DayOrder): Span | null {
  const s = text.trim().toLowerCase()
  if (s === 'today') return one(toISODate(now))
  if (s === 'yesterday') return one(toISODate(addDays(now, -1)))
  let m = /^(\d{1,4})\s*([dwmy])$/.exec(s)
  if (m) return one(ago(Number(m[1]), m[2], now))
  m = /^(\d{4})$/.exec(s)
  if (m) return { since: `${m[1]}-01-01`, until: `${m[1]}-12-31` }
  m = /^(\d{4})[-/.](\d{1,2})$/.exec(s)
  if (m) return month(Number(m[1]), Number(m[2]))
  m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(s)
  if (m) return one(day(Number(m[1]), Number(m[2]), Number(m[3])))
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(s)
  if (m) {
    const [a, b, y] = [Number(m[1]), Number(m[2]), Number(m[3])]
    const dayFirst = day(y, b, a)
    const monthFirst = day(y, a, b)
    return one(
      order === 'mdy' ? (monthFirst ?? dayFirst) : (dayFirst ?? monthFirst),
    )
  }
  return null
}

// a bare dash also separates the parts of 2026-08-01
const RANGE_SEP = /\s*\.\.\s*|\s+(?:-|–|—|to)\s+/

export function parseDateInput(
  text: string,
  now: Date,
  order: DayOrder,
): ParsedInput {
  if (!text.trim()) return { kind: 'empty' }
  const sides = text.trim().split(RANGE_SEP)
  if (sides.length === 2) {
    const a = parseOne(sides[0], now, order)
    const b = parseOne(sides[1], now, order)
    if (!a || !b) return { kind: 'invalid' }
    return { kind: 'span', span: ordered(a.since, b.until, a, b), range: true }
  }
  if (sides.length > 2) return { kind: 'invalid' }
  const span = parseOne(text, now, order)
  return span ? { kind: 'span', span, range: false } : { kind: 'invalid' }
}

function ordered(since: string, until: string, a: Span, b: Span): Span {
  return since <= until ? { since, until } : { since: b.since, until: a.until }
}

export function orderRange(r: DateRange): DateRange {
  if (r.since && r.until && r.since > r.until)
    return { since: r.until, until: r.since }
  return r
}

const withYear = new Intl.DateTimeFormat('en', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
})
const noYear = new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' })

export function describeRange(r: DateRange): string {
  const since = r.since ? parseISODate(r.since) : null
  const until = r.until ? parseISODate(r.until) : null
  if (since && until) {
    const days = Math.round((until.getTime() - since.getTime()) / 864e5) + 1
    const count = `(${days.toLocaleString('en')} ${days === 1 ? 'day' : 'days'})`
    if (r.since === r.until) return `${withYear.format(since)} ${count}`
    const head =
      since.getFullYear() === until.getFullYear()
        ? noYear.format(since)
        : withYear.format(since)
    return `${head} to ${withYear.format(until)} ${count}`
  }
  if (since) return `From ${withYear.format(since)} onwards`
  if (until) return `Up to ${withYear.format(until)}`
  return 'Any time'
}
