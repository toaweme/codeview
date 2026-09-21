import { TriangleAlert } from 'lucide-react'
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

export function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-6 py-16 text-center text-muted-foreground">
      {children}
    </div>
  )
}
