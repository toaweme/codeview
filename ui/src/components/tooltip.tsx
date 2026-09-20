import { Tooltip as T } from 'radix-ui'
import { cn } from '@/lib/cn'

export function TooltipProvider({ children }: { children: React.ReactNode }) {
  return (
    <T.Provider
      delayDuration={250}
      skipDelayDuration={100}
      disableHoverableContent
    >
      {children}
    </T.Provider>
  )
}

export function Tooltip({
  label,
  children,
  side = 'top',
  className,
}: {
  label: React.ReactNode
  children: React.ReactNode
  side?: 'top' | 'bottom' | 'left' | 'right'
  className?: string
}) {
  return (
    <T.Root disableHoverableContent>
      <T.Trigger asChild>{children}</T.Trigger>
      <T.Portal>
        <T.Content
          side={side}
          sideOffset={6}
          className={cn(
            'pointer-events-none z-[70] max-w-sm select-none rounded-lg',
            'bg-foreground px-2.5 py-1.5 text-background text-sm',
            '[&_kbd]:bg-background/15 [&_kbd]:text-background',
            className,
          )}
        >
          {label}
        </T.Content>
      </T.Portal>
    </T.Root>
  )
}
