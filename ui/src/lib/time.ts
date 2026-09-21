const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['week', 7 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60],
]

export function relativeTime(iso: string, now = Date.now()): string {
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return ''
  const secs = Math.round((t - now) / 1000)
  for (const [unit, size] of UNITS) {
    if (Math.abs(secs) >= size) return rtf.format(Math.trunc(secs / size), unit)
  }
  return 'just now'
}

const dayFmt = new Intl.DateTimeFormat('en', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
})

const fullFmt = new Intl.DateTimeFormat('en', {
  dateStyle: 'medium',
  timeStyle: 'short',
})

export function formatDay(iso: string): string {
  const t = Date.parse(iso)
  return Number.isNaN(t) ? '' : dayFmt.format(t)
}

export function formatFull(iso: string): string {
  const t = Date.parse(iso)
  return Number.isNaN(t) ? '' : fullFmt.format(t)
}

export function dayKey(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

export function ageRatio(iso: string, oldest: number, newest: number): number {
  const t = Date.parse(iso)
  if (Number.isNaN(t) || newest <= oldest) return 1
  return Math.min(1, Math.max(0, (t - oldest) / (newest - oldest)))
}
