import { useQuery } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { histogramQuery } from '@/api/queries'
import type { Histogram } from '@/api/types'
import { cn } from '@/lib/cn'
import {
  type Bucket,
  bucketDays,
  type DateField,
  type DateRange,
  overlaps,
  parseISODate,
  rangeLabel,
} from './filters'

const MAX_WEEKS = 156
const BARS_H = 40
const LABELS_H = 16

const monthFmt = new Intl.DateTimeFormat('en', {
  month: 'long',
  year: 'numeric',
})
const edgeFmt = new Intl.DateTimeFormat('en', {
  month: 'short',
  year: 'numeric',
})

export function HistoryStrip({
  repo,
  rev,
  path,
  field,
  range,
  onPick,
}: {
  repo: string
  rev: string
  path: string
  field: DateField
  range: DateRange
  onPick: (r: DateRange) => void
}) {
  const dateField = field === 'committer' ? field : undefined
  const weeks = useQuery({
    ...histogramQuery(repo, rev, path, 'week', dateField),
    enabled: !!rev,
  })
  const long = (weeks.data?.buckets.length ?? 0) > MAX_WEEKS
  const months = useQuery({
    ...histogramQuery(repo, rev, path, 'month', dateField),
    enabled: !!rev && long,
  })
  const bucket: Bucket = long ? 'month' : 'week'
  const data = long ? months.data : weeks.data
  const failed = weeks.isError || months.isError

  if (failed) return null
  return (
    <div className="px-2 pt-3 pb-1" style={{ height: BARS_H + LABELS_H + 16 }}>
      {data ? (
        data.buckets.length > 0 && (
          <Bars data={data} bucket={bucket} range={range} onPick={onPick} />
        )
      ) : (
        <div
          className="animate-pulse rounded-md bg-muted"
          style={{ height: BARS_H }}
          aria-hidden
        />
      )}
    </div>
  )
}

const ALWAYS_YEAR = new Date(0)

function bucketLabel(start: string, bucket: Bucket): string {
  const days = bucketDays(start, bucket)
  if (bucket === 'month') {
    const d = parseISODate(days.since)
    return d ? monthFmt.format(d) : ''
  }
  return rangeLabel(days, ALWAYS_YEAR)
}

function Bars({
  data,
  bucket,
  range,
  onPick,
}: {
  data: Histogram
  bucket: Bucket
  range: DateRange
  onPick: (r: DateRange) => void
}) {
  const box = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const [hover, setHover] = useState<number | null>(null)
  const [drag, setDrag] = useState<{ a: number; b: number } | null>(null)

  useEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setWidth(e?.contentRect.width ?? 0))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const buckets = data.buckets
  const n = buckets.length
  const slot = width / n
  const gap = slot >= 6 ? 2 : slot >= 3 ? 1 : 0
  const max = Math.max(1, ...buckets.map((b) => b.count))
  const days = buckets.map((b) => bucketDays(b.start, bucket))
  const filtered = !!(range.since || range.until)
  const lo = drag ? Math.min(drag.a, drag.b) : -1
  const hi = drag ? Math.max(drag.a, drag.b) : -1

  const index = (e: React.PointerEvent) => {
    const rect = e.currentTarget.getBoundingClientRect()
    return Math.min(
      n - 1,
      Math.max(0, Math.floor((e.clientX - rect.left) / slot)),
    )
  }
  const finish = () => {
    if (!drag) return
    const since = days[lo]?.since
    const until = days[hi]?.until
    setDrag(null)
    if (!since || !until) return
    if (since === range.since && until === range.until) onPick({})
    else onPick({ since, until })
  }

  const ticks: { x: number; label: string }[] = []
  let lastYear = -1
  for (let i = 0; i < n; i++) {
    const d = parseISODate(days[i]?.until ?? '')
    if (!d) continue
    const year = d.getFullYear()
    if (year === lastYear) continue
    lastYear = year
    const x = i * slot
    const prev = ticks[ticks.length - 1]
    if (i > 0 && (!prev || x - prev.x >= 44) && x < width - 36)
      ticks.push({ x, label: String(year) })
  }

  const tipIndex = drag ? drag.b : hover
  let tip: { x: number; title: string; count: number } | null = null
  if (tipIndex !== null && days[tipIndex]) {
    if (drag && lo !== hi) {
      const count = buckets.slice(lo, hi + 1).reduce((s, b) => s + b.count, 0)
      tip = {
        x: (lo + hi + 1) * slot * 0.5,
        title: rangeLabel(
          { since: days[lo]?.since, until: days[hi]?.until },
          ALWAYS_YEAR,
        ),
        count,
      }
    } else {
      const b = buckets[tipIndex]
      if (b)
        tip = {
          x: (tipIndex + 0.5) * slot,
          title: bucketLabel(b.start, bucket),
          count: b.count,
        }
    }
  }

  const first = data.first ? parseISODate(data.first.slice(0, 10)) : null
  const last = buckets[n - 1] ? parseISODate(days[n - 1]?.since ?? '') : null
  const unit = bucket === 'month' ? 'month' : 'week'

  return (
    <div ref={box} className="relative select-none">
      {width > 0 && (
        <svg
          width={width}
          height={BARS_H}
          role="img"
          aria-label={`Commits per ${unit}${first && last ? ` from ${edgeFmt.format(first)} to ${edgeFmt.format(last)}` : ''}. Click a bar or drag across bars to filter the history.`}
          className="block cursor-pointer touch-none"
          onPointerDown={(e) => {
            const i = index(e)
            e.currentTarget.setPointerCapture(e.pointerId)
            setDrag({ a: i, b: i })
          }}
          onPointerMove={(e) => {
            const i = index(e)
            setHover(i)
            if (drag && drag.b !== i) setDrag({ a: drag.a, b: i })
          }}
          onPointerUp={finish}
          onPointerCancel={() => setDrag(null)}
          onPointerLeave={() => !drag && setHover(null)}
        >
          <rect
            x={0}
            y={BARS_H - 1}
            width={width}
            height={1}
            className="fill-muted"
          />
          {buckets.map((b, i) => {
            const d = days[i]
            if (!d || b.count === 0) return null
            const h = Math.max(2, (b.count / max) * (BARS_H - 2))
            const lifted = drag
              ? i >= lo && i <= hi
              : filtered && overlaps(d, range)
            return (
              <rect
                key={b.start}
                x={i * slot + gap / 2}
                y={BARS_H - h}
                width={Math.max(1, slot - gap)}
                height={h}
                rx={Math.min(2, (slot - gap) / 2)}
                className={cn(
                  'transition-[fill,opacity] duration-75',
                  lifted
                    ? 'fill-primary'
                    : filtered || drag
                      ? 'fill-faint opacity-40'
                      : 'fill-faint opacity-70',
                  hover === i && !drag && 'opacity-100',
                )}
              />
            )
          })}
        </svg>
      )}
      <div
        className="relative text-faint text-xs num"
        style={{ height: LABELS_H }}
      >
        {ticks.map((t) => (
          <span
            key={t.label}
            className="absolute top-0.5"
            style={{ left: t.x }}
          >
            {t.label}
          </span>
        ))}
      </div>
      {tip && (
        <div
          role="tooltip"
          className={cn(
            'pointer-events-none absolute z-10 rounded-lg',
            'bottom-full mb-1.5 px-2.5 py-1.5',
            'whitespace-nowrap bg-foreground text-background text-sm',
          )}
          style={{
            left: Math.min(Math.max(tip.x, 90), Math.max(90, width - 90)),
            transform: 'translateX(-50%)',
          }}
        >
          <div className="font-medium num">{tip.title}</div>
          <div className="opacity-80 num">
            {tip.count.toLocaleString()}{' '}
            {tip.count === 1 ? 'commit' : 'commits'}
          </div>
        </div>
      )}
    </div>
  )
}
