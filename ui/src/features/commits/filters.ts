export type PresetId = 'today' | '7d' | '30d' | 'month' | 'last-month' | 'year'

export type DateField = 'author' | 'committer'

export type HistoryFilter = {
  range?: PresetId
  since?: string
  until?: string
  author?: string
  grep?: string
  date?: 'committer'
}

export const PRESETS: { id: PresetId; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: '7d', label: 'Last 7 days' },
  { id: '30d', label: 'Last 30 days' },
  { id: 'month', label: 'This month' },
  { id: 'last-month', label: 'Last month' },
  { id: 'year', label: 'This year' },
]

const PRESET_IDS = new Set<string>(PRESETS.map((p) => p.id))
const MAX_TEXT = 200

export type DateRange = { since?: string; until?: string }

function pad(n: number, width = 2): string {
  return String(n).padStart(width, '0')
}

export function toISODate(d: Date): string {
  return `${pad(d.getFullYear(), 4)}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function parseISODate(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (!m) return null
  const [y, mo, d] = [Number(m[1]), Number(m[2]) - 1, Number(m[3])]
  const date = new Date(y, mo, d)
  if (
    date.getFullYear() !== y ||
    date.getMonth() !== mo ||
    date.getDate() !== d
  )
    return null
  return date
}

export function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)
}

export function presetRange(id: PresetId, now: Date): Required<DateRange> {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const y = today.getFullYear()
  const m = today.getMonth()
  const iso = toISODate
  switch (id) {
    case 'today':
      return { since: iso(today), until: iso(today) }
    case '7d':
      return { since: iso(addDays(today, -6)), until: iso(today) }
    case '30d':
      return { since: iso(addDays(today, -29)), until: iso(today) }
    case 'month':
      return { since: iso(new Date(y, m, 1)), until: iso(today) }
    case 'last-month':
      return {
        since: iso(new Date(y, m - 1, 1)),
        until: iso(new Date(y, m, 0)),
      }
    case 'year':
      return { since: iso(new Date(y, 0, 1)), until: iso(today) }
  }
}

export function dateRange(f: HistoryFilter, now: Date): DateRange {
  if (f.range) return presetRange(f.range, now)
  return { since: f.since, until: f.until }
}

function text(v: unknown): string | undefined {
  // the router decodes a numeric-looking value such as ?author=42 as a number
  const s = typeof v === 'number' ? String(v) : typeof v === 'string' ? v : ''
  const t = s.trim().slice(0, MAX_TEXT)
  return t || undefined
}

function day(v: unknown): string | undefined {
  return typeof v === 'string' && parseISODate(v) ? v : undefined
}

export function parseHistoryFilter(
  search: Record<string, unknown>,
): HistoryFilter {
  const out: HistoryFilter = {}
  if (typeof search.range === 'string' && PRESET_IDS.has(search.range)) {
    out.range = search.range as PresetId
  } else {
    let since = day(search.since)
    let until = day(search.until)
    if (since && until && since > until) [since, until] = [until, since]
    if (since) out.since = since
    if (until) out.until = until
  }
  const author = text(search.author)
  const grep = text(search.grep)
  if (author) out.author = author
  if (grep) out.grep = grep
  if (search.date === 'committer') out.date = 'committer'
  return out
}

export function hasFilter(f: HistoryFilter): boolean {
  return !!(f.range || f.since || f.until || f.author || f.grep)
}

export function dateField(f: HistoryFilter): DateField {
  return f.date ?? 'author'
}

// getTimezoneOffset counts the opposite way to an RFC3339 offset
export function formatOffset(minutes: number): string {
  const east = -minutes
  const sign = east < 0 ? '-' : '+'
  const abs = Math.abs(east)
  return `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
}

export function localBound(iso: string, end: boolean): string | undefined {
  const d = parseISODate(iso)
  if (!d) return undefined
  const time = end ? 'T23:59:59' : 'T00:00:00'
  return `${iso}${time}${formatOffset(d.getTimezoneOffset())}`
}

export function apiParams(
  f: HistoryFilter,
  now: Date,
): Record<string, string | undefined> {
  const r = dateRange(f, now)
  return {
    since: r.since ? localBound(r.since, false) : undefined,
    until: r.until ? localBound(r.until, true) : undefined,
    author: f.author,
    grep: f.grep,
    date_field: f.date,
  }
}

export function widen(r: DateRange, now: Date): DateRange {
  const today = toISODate(now)
  const since = r.since ? parseISODate(r.since) : null
  const until = r.until ? parseISODate(r.until) : null
  if (!since) return {}
  const end = until ?? parseISODate(today) ?? since
  const span = Math.round((end.getTime() - since.getTime()) / 86_400_000) + 1
  const extra = Math.max(span, 7)
  const wider = toISODate(addDays(end, extra))
  return {
    since: toISODate(addDays(since, -extra)),
    until: !until ? undefined : wider > today ? today : wider,
  }
}

export function monthGrid(year: number, month: number): Date[] {
  const first = new Date(year, month, 1)
  const back = (first.getDay() + 6) % 7
  return Array.from(
    { length: 42 },
    (_, i) => new Date(year, month, 1 - back + i),
  )
}

export type Bucket = 'day' | 'week' | 'month'

// the API starts buckets at UTC midnight
export function bucketDays(start: string, bucket: Bucket): Required<DateRange> {
  const s = new Date(start)
  const y = s.getUTCFullYear()
  const m = s.getUTCMonth()
  const d = s.getUTCDate()
  const first = new Date(y, m, d)
  const last =
    bucket === 'month'
      ? new Date(y, m + 1, 0)
      : bucket === 'week'
        ? addDays(first, 6)
        : first
  return { since: toISODate(first), until: toISODate(last) }
}

export function overlaps(b: Required<DateRange>, r: DateRange): boolean {
  return (!r.until || b.since <= r.until) && (!r.since || b.until >= r.since)
}

const shortFmt = new Intl.DateTimeFormat('en', {
  month: 'short',
  day: 'numeric',
})
const longFmt = new Intl.DateTimeFormat('en', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
})

export function rangeLabel(r: DateRange, now: Date): string {
  const since = r.since ? parseISODate(r.since) : null
  const until = r.until ? parseISODate(r.until) : null
  const year = now.getFullYear()
  const fmt = (d: Date, sameYear: boolean) =>
    (sameYear ? shortFmt : longFmt).format(d)
  if (since && until) {
    const same = since.getFullYear() === year && until.getFullYear() === year
    if (r.since === r.until) return fmt(since, same)
    return `${fmt(since, same)} to ${fmt(until, same)}`
  }
  if (since) return `Since ${fmt(since, since.getFullYear() === year)}`
  if (until) return `Until ${fmt(until, until.getFullYear() === year)}`
  return 'Any time'
}

export function filterLabel(f: HistoryFilter, now: Date): string {
  if (f.range) return PRESETS.find((p) => p.id === f.range)?.label ?? ''
  return rangeLabel({ since: f.since, until: f.until }, now)
}
