import { Slot } from 'radix-ui'
import { cn } from '@/lib/cn'

const base = [
  'inline-flex items-center justify-center gap-1.5 whitespace-nowrap',
  'rounded-lg font-medium transition-colors duration-100',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
  'disabled:pointer-events-none disabled:opacity-50',
  '[&_svg]:size-4 [&_svg]:shrink-0',
].join(' ')

const variants = {
  primary: 'bg-primary text-primary-foreground hover:bg-primary/90',
  outline: 'bg-accent text-foreground hover:bg-hover',
  ghost: 'text-muted-foreground hover:bg-hover hover:text-foreground',
  subtle: 'bg-muted text-foreground hover:bg-accent',
}

const sizes = {
  xs: 'h-7 px-2.5 text-sm',
  sm: 'h-8 px-3 text-sm',
  md: 'h-9 px-4 text-base',
  icon: 'size-8',
}

export type ButtonProps = React.ComponentProps<'button'> & {
  variant?: keyof typeof variants
  size?: keyof typeof sizes
  asChild?: boolean
}

export function Button({
  className,
  variant = 'outline',
  size = 'sm',
  asChild = false,
  type,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot.Root : 'button'
  return (
    <Comp
      type={asChild ? undefined : (type ?? 'button')}
      className={cn(base, variants[variant], sizes[size], className)}
      {...props}
    />
  )
}
