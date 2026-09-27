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
      <T.Trigger asChild onFocus={skipPointerFocus}>
        {children}
      </T.Trigger>
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

// skipPointerFocus keeps the tooltip shut when focus lands without the keyboard,
// such as a popover handing focus back to its trigger after a click.
// Radix skips its own open handler once this one prevents the default.
function skipPointerFocus(e: React.FocusEvent<HTMLElement>) {
  try {
    if (!e.currentTarget.matches(':focus-visible')) e.preventDefault()
  } catch {
    // an engine without :focus-visible keeps the default behaviour
  }
}
