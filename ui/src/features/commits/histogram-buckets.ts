import type { Histogram } from '@/api/types'
import type { Bucket } from './filters'

// MAX_WEEKS switches to month buckets past three years of weeks.
export const MAX_WEEKS = 156

// SHORT_WEEKS switches to day buckets so a short history still reads as a chart.
export const SHORT_WEEKS = 4

// MIN_SLOTS keeps bars from stretching across the whole strip.
export const MIN_SLOTS: Record<Bucket, number> = {
  day: 14,
  week: 12,
  month: 12,
}

export type Slot = { start: string; count: number; pad: boolean }

// chooseBucket picks the bucket size from the number of week buckets.
export function chooseBucket(weeks: number): Bucket {
  if (weeks > MAX_WEEKS) return 'month'
  if (weeks <= SHORT_WEEKS) return 'day'
  return 'week'
}

function stepBack(start: string, bucket: Bucket, n: number): string {
  const d = new Date(start)
  if (bucket === 'month') d.setUTCMonth(d.getUTCMonth() - n)
  else d.setUTCDate(d.getUTCDate() - n * (bucket === 'week' ? 7 : 1))
  return d.toISOString()
}

// padSlots prepends empty padding buckets until there are at least
// MIN_SLOTS[bucket] slots, so the data sits at the most recent end.
export function padSlots(
  buckets: Histogram['buckets'],
  bucket: Bucket,
): Slot[] {
  const slots = buckets.map((b) => ({ ...b, pad: false }))
  const first = buckets[0]
  const missing = MIN_SLOTS[bucket] - buckets.length
  if (!first || missing <= 0) return slots
  const pads = Array.from({ length: missing }, (_, i) => ({
    start: stepBack(first.start, bucket, missing - i),
    count: 0,
    pad: true,
  }))
  return [...pads, ...slots]
}
