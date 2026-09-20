import { cn } from '@/lib/cn'

const TONES = {
  neutral: 'bg-accent text-muted-foreground',
  primary: 'bg-primary/12 text-primary',
  add: 'bg-add/14 text-add',
  del: 'bg-del/14 text-del',
  warn: 'bg-warn/14 text-warn',
  info: 'bg-info/14 text-info',
} as const

export type BadgeTone = keyof typeof TONES

export function Badge({
  tone = 'neutral',
  className,
  children,
  title,
}: {
  tone?: BadgeTone
  className?: string
  children: React.ReactNode
  title?: string
}) {
  return (
    <span
      title={title}
      className={cn(
        'inline-flex h-(--badge-h) max-w-full shrink-0 items-center gap-1',
        'whitespace-nowrap rounded-md px-2 font-medium text-xs num',
        '[&_svg]:size-3.5 [&_svg]:shrink-0',
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}

export function Counts({ add, del }: { add: number; del: number }) {
  return (
    <span className="flex shrink-0 items-center gap-1">
      <Badge tone="add">+{add.toLocaleString()}</Badge>
      <Badge tone="del">−{del.toLocaleString()}</Badge>
    </span>
  )
}
