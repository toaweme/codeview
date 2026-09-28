import { Link } from '@tanstack/react-router'
import { Tag } from 'lucide-react'
import { useMemo } from 'react'
import type { Repo } from '@/api/types'
import { Badge } from '@/components/badge'
import { Tooltip } from '@/components/tooltip'
import { cn } from '@/lib/cn'
import { usePressPreload } from '@/lib/preload'
import { repoBase } from '@/lib/repo-name'
import { formatFull, relativeTime, spanLabel } from '@/lib/time'
import { groupLink, repoLink } from '@/lib/url'
import { orgStats, stackWeeks, weekStart } from './org-stats'
import { ACTIVE_WEEKS, orgColor } from './sidebar-rank'

const SHADES = [100, 76, 58, 44, 32]
const OTHER = 'color-mix(in oklab, var(--faint) 45%, transparent)'

// shade takes the tone as a value because the week tooltip renders in a
// portal outside the strip that defines --tone.
const shade = (tone: string, i: number, key: string | null) =>
  key === null
    ? OTHER
    : `color-mix(in oklab, ${tone} ${SHADES[i] ?? SHADES[SHADES.length - 1]}%, transparent)`

// OrgStrip opens an org section with its recent numbers and a weekly
// commit chart stacked by repository.
export function OrgStrip({
  group,
  label,
  repos,
}: {
  group: string
  label: string
  repos: Repo[]
}) {
  const preload = usePressPreload()
  const stats = useMemo(() => orgStats(repos), [repos])
  const stack = useMemo(() => stackWeeks(repos), [repos])
  const tone = orgColor(group)
  const release = stats.release
  const releaseLink = release
    ? repoLink(release.repo, { kind: 'tree', ref: release.tag.name, path: '' })
    : undefined
  return (
    <div
      style={{ '--tone': tone } as React.CSSProperties}
      className={cn(
        'flex flex-col gap-5 rounded-2xl p-5 md:flex-row md:items-center',
        'bg-[color-mix(in_oklab,var(--tone)_7%,var(--island-muted))]',
      )}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <h2 className="flex min-w-0 items-center gap-2.5 font-semibold text-lg tracking-tight">
          <span
            aria-hidden
            className="size-2.5 shrink-0 rounded-full bg-(--tone)"
          />
          {group ? (
            <Link
              {...groupLink(group)}
              title={group}
              className="truncate rounded-md outline-none transition-colors duration-100 hover:text-(--tone) focus-visible:outline-2 focus-visible:outline-ring"
            >
              {label}
            </Link>
          ) : (
            <span className="truncate">{label}</span>
          )}
        </h2>
        <dl className="flex flex-wrap items-end gap-x-8 gap-y-3">
          <Stat label="Repositories" value={stats.repos} />
          <Stat
            label={`Commits, ${ACTIVE_WEEKS} weeks`}
            value={stats.commits}
          />
          <Stat
            label={`Contributors, ${ACTIVE_WEEKS} weeks`}
            value={stats.contributors}
          />
          {release && releaseLink && (
            <div className="flex min-w-0 flex-col gap-1">
              <dt className="text-faint text-xs">Latest release</dt>
              <dd className="flex min-w-0">
                <Tooltip
                  label={`${repoBase(release.repo)}, tagged ${formatFull(release.tag.tagged_at)}`}
                >
                  <Link
                    {...releaseLink}
                    {...preload(releaseLink)}
                    className="flex min-w-0 rounded-md outline-none focus-visible:outline-2 focus-visible:outline-ring"
                  >
                    <Badge tone="info" className="min-w-0 hover:bg-info/22">
                      <Tag aria-hidden />
                      <span className="truncate">
                        {repoBase(release.repo)} {release.tag.name}
                      </span>
                      <span className="whitespace-nowrap font-normal opacity-75">
                        {relativeTime(release.tag.tagged_at)}
                      </span>
                    </Badge>
                  </Link>
                </Tooltip>
              </dd>
            </div>
          )}
        </dl>
      </div>
      <WeekChart tone={tone} series={stack.series} weeks={stack.weeks} />
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-faint text-xs">{label}</dt>
      <dd className="num font-semibold text-xl leading-none tracking-tight">
        {value.toLocaleString()}
      </dd>
    </div>
  )
}

function WeekChart({
  tone,
  series,
  weeks,
}: {
  tone: string
  series: (string | null)[]
  weeks: number[][]
}) {
  const now = useMemo(() => Date.now(), [])
  const peak = Math.max(1, ...weeks.map((w) => w.reduce((a, b) => a + b, 0)))
  const total = weeks.reduce((n, w) => n + w.reduce((a, b) => a + b, 0), 0)
  return (
    <div
      role="img"
      aria-label={`${total.toLocaleString()} commits in the last ${weeks.length} weeks`}
      className="flex h-20 w-full shrink-0 items-end gap-1.5 md:w-80"
    >
      {weeks.map((counts, w) => {
        const sum = counts.reduce((a, b) => a + b, 0)
        return (
          <Tooltip
            // biome-ignore lint/suspicious/noArrayIndexKey: weeks are positional
            key={w}
            label={
              <WeekTip
                tone={tone}
                start={weekStart(w, weeks.length, now)}
                series={series}
                counts={counts}
                sum={sum}
              />
            }
          >
            <span className="flex h-full flex-1 flex-col-reverse rounded-md transition-colors duration-75 hover:bg-foreground/5">
              {sum === 0 ? (
                <span className="h-0.5 rounded-full bg-faint/30" />
              ) : (
                <span
                  className="flex flex-col-reverse gap-px overflow-hidden rounded-md"
                  style={{ height: `${Math.max(6, (sum / peak) * 100)}%` }}
                >
                  {counts.map((n, s) =>
                    n === 0 ? null : (
                      <span
                        key={series[s] ?? ''}
                        className="min-h-0.5 basis-0"
                        style={{
                          flexGrow: n,
                          background: shade(tone, s, series[s]),
                        }}
                      />
                    ),
                  )}
                </span>
              )}
            </span>
          </Tooltip>
        )
      })}
    </div>
  )
}

function WeekTip({
  tone,
  start,
  series,
  counts,
  sum,
}: {
  tone: string
  start: Date
  series: (string | null)[]
  counts: number[]
  sum: number
}) {
  const rows = series
    .map((key, s) => ({ key, s, n: counts[s] ?? 0 }))
    .filter((r) => r.n > 0)
  return (
    <div className="flex min-w-40 flex-col gap-1">
      <p className="flex gap-4 font-medium">
        <span>
          {spanLabel(
            start,
            new Date(
              start.getFullYear(),
              start.getMonth(),
              start.getDate() + 6,
            ),
          )}
        </span>
        <span className="num ml-auto">{sum}</span>
      </p>
      {rows.map(({ key, s, n }) => (
        <p key={key ?? ''} className="flex items-center gap-2 opacity-85">
          <span
            aria-hidden
            className="size-2 shrink-0 rounded-full"
            style={{ background: shade(tone, s, key) }}
          />
          <span className="truncate">
            {key === null ? 'Other' : repoBase(key)}
          </span>
          <span className="num ml-auto pl-4">{n}</span>
        </p>
      ))}
    </div>
  )
}
