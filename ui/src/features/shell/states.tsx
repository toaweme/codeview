import { ArrowUpRight, TriangleAlert } from 'lucide-react'
import { ApiError } from '@/api/client'
import { cn } from '@/lib/cn'

export function ErrorState({
  error,
  className,
}: {
  error: unknown
  className?: string
}) {
  const status = error instanceof ApiError ? error.status : undefined
  const message =
    error instanceof Error ? error.message : 'Something went wrong.'
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-2 px-6 py-16 text-center',
        className,
      )}
    >
      <TriangleAlert className="size-6 text-faint" aria-hidden />
      <p className="font-medium">
        {status === 404 ? 'Not found' : 'Could not load this'}
      </p>
      <p className="max-w-md text-muted-foreground">{message}</p>
    </div>
  )
}

export function Skeleton({
  lines = 8,
  className,
}: {
  lines?: number
  className?: string
}) {
  return (
    <div className={cn('space-y-3 px-6 py-5', className)} aria-hidden>
      {Array.from({ length: lines }, (_, i) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: static placeholder rows
          key={i}
          className="h-3.5 animate-pulse rounded-md bg-muted"
          style={{ width: `${40 + ((i * 37) % 55)}%` }}
        />
      ))}
    </div>
  )
}

export type EmptyProps = {
  // title is the short headline. Plain children stand in for it.
  title?: React.ReactNode
  children?: React.ReactNode
  description?: React.ReactNode
  link?: { href: string; label: string }
  // size picks the page-level layout or the compact one used inside panels.
  size?: 'page' | 'panel'
  // light drops the illustration, for filters that matched nothing.
  light?: boolean
  className?: string
}

// Empty is the designed empty state, with a small commit graph drawing,
// a title, one line of copy and an optional quiet link.
export function Empty({
  title,
  children,
  description,
  link,
  size = 'page',
  light = false,
  className,
}: EmptyProps) {
  const page = size === 'page'
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center',
        page ? 'gap-2 px-4 py-12 sm:px-6 sm:py-20' : 'gap-1 px-4 py-10',
        light && (page ? 'py-16' : 'py-8'),
        className,
      )}
    >
      {!light && <EmptyArt className={page ? 'mb-4 w-40' : 'mb-2.5 w-28'} />}
      <p
        className={cn(
          'text-balance font-semibold',
          page ? 'text-lg' : 'text-sm',
          light && 'font-medium text-muted-foreground',
        )}
      >
        {title ?? children}
      </p>
      {description && (
        <p
          className={cn(
            'max-w-sm text-balance text-muted-foreground',
            page ? 'text-base' : 'text-sm',
            light && 'text-faint',
          )}
        >
          {description}
        </p>
      )}
      {link && (
        <a
          href={link.href}
          target="_blank"
          rel="noreferrer"
          className={cn(
            'mt-2 inline-flex items-center gap-1 rounded-md px-2 py-1',
            'text-muted-foreground text-sm transition-colors duration-100',
            'hover:bg-hover hover:text-foreground',
            'focus-visible:outline-2 focus-visible:outline-ring',
          )}
        >
          {link.label}
          <ArrowUpRight className="size-3.5" aria-hidden />
        </a>
      )}
    </div>
  )
}

const LANE = { fill: 'none', strokeWidth: 2, strokeLinecap: 'round' } as const

function delay(ms: number) {
  return { '--d': `${ms}ms` } as React.CSSProperties
}

// EmptyArt draws a soft branch that forks off a main line and merges back.
function EmptyArt({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 132 80"
      className={className}
      aria-hidden
      focusable="false"
    >
      <ellipse
        cx="66"
        cy="42"
        rx="62"
        ry="36"
        style={{ fill: 'var(--primary)', fillOpacity: 0.06 }}
      />
      <path
        d="M12 54 H120"
        pathLength={1}
        className="empty-lane"
        style={{ ...LANE, stroke: 'var(--faint)', strokeOpacity: 0.5 }}
      />
      <path
        d="M30 54 C44 54 42 28 56 28 H78 C92 28 90 54 104 54"
        pathLength={1}
        className="empty-lane"
        style={{
          ...LANE,
          ...delay(250),
          stroke: 'var(--primary)',
          strokeOpacity: 0.5,
        }}
      />
      {[22, 66, 88].map((x, i) => (
        <circle
          key={x}
          cx={x}
          cy="54"
          r="3.5"
          className="empty-node"
          style={{
            ...delay(150 + i * 180),
            fill: 'var(--faint)',
            fillOpacity: 0.7,
          }}
        />
      ))}
      {[56, 78].map((x, i) => (
        <circle
          key={x}
          cx={x}
          cy="28"
          r="3.5"
          className="empty-node"
          style={{
            ...delay(550 + i * 160),
            fill: 'var(--primary)',
            fillOpacity: 0.75,
          }}
        />
      ))}
      <circle
        cx="104"
        cy="54"
        r="9"
        className="empty-node"
        style={{ ...delay(950), fill: 'var(--primary)', fillOpacity: 0.14 }}
      />
      <circle
        cx="104"
        cy="54"
        r="4.5"
        className="empty-node"
        style={{ ...delay(950), fill: 'var(--primary)' }}
      />
    </svg>
  )
}
