import { cn } from '@/lib/cn'

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  const first = parts[0][0]
  const last = parts.length > 1 ? parts[parts.length - 1][0] : ''
  return `${first}${last}`.toUpperCase()
}

// Avatar is an initials circle, since commits carry no picture.
// It spreads its props so it can serve as a tooltip trigger.
export function Avatar({
  name,
  className,
  ...props
}: { name: string } & React.ComponentProps<'span'>) {
  return (
    <span
      {...props}
      className={cn(
        'grid size-7 shrink-0 place-items-center rounded-full',
        'bg-accent font-medium text-muted-foreground text-xs',
        className,
      )}
    >
      {initials(name)}
    </span>
  )
}
