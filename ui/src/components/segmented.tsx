import { Tooltip } from '@/components/tooltip'
import { cn } from '@/lib/cn'

// an invisible medium-weight copy keeps the width fixed when the segment turns on
export function SteadyLabel({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <span className={cn('inline-grid min-w-0', className)}>
      <span
        aria-hidden
        className="invisible col-start-1 row-start-1 flex items-center justify-center gap-1.5 font-medium"
      >
        {children}
      </span>
      <span className="col-start-1 row-start-1 flex min-w-0 items-center justify-center gap-1.5">
        {children}
      </span>
    </span>
  )
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
  fill,
}: {
  value: T
  onChange: (value: T) => void
  options: { value: T; label: React.ReactNode; title?: string }[]
  className?: string
  fill?: boolean
}) {
  return (
    <div
      role="radiogroup"
      className={cn(
        'flex h-9 shrink-0 items-center gap-0.5 rounded-lg bg-island-muted p-0.5',
        fill ? 'w-full' : 'w-max',
        className,
      )}
    >
      {options.map((o) => {
        const on = o.value === value
        const button = (
          // biome-ignore lint/a11y/useSemanticElements: a styled radio group, the buttons carry role and state
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={cn(
              'flex h-full items-center justify-center gap-1.5 whitespace-nowrap',
              'rounded-md px-3 text-sm transition-colors duration-100',
              'focus-visible:outline-2 focus-visible:outline-ring',
              '[&_svg]:size-4 [&_svg]:shrink-0',
              fill ? 'min-w-0 flex-1' : 'shrink-0',
              on
                ? 'bg-background font-medium text-foreground shadow-[0_1px_2px_rgb(0_0_0/0.08)]'
                : 'text-muted-foreground hover:bg-hover hover:text-foreground',
            )}
          >
            <SteadyLabel>{o.label}</SteadyLabel>
          </button>
        )
        return o.title ? (
          <Tooltip
            key={o.value}
            label={
              <>
                <div className="font-medium">{o.label}</div>
                <div className="opacity-80">{o.title}</div>
              </>
            }
            side="bottom"
          >
            {button}
          </Tooltip>
        ) : (
          button
        )
      })}
    </div>
  )
}
