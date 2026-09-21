import { useVirtualizer } from '@tanstack/react-virtual'
import type { LucideIcon } from 'lucide-react'
import { Check } from 'lucide-react'
import { Popover } from 'radix-ui'
import { useEffect, useMemo, useRef } from 'react'
import { cn } from '@/lib/cn'
import { groupRows, type Option, optionId } from './listbox'

export type RowOption<T extends string = string> = Option<T> & {
  icon?: LucideIcon
  badge?: React.ReactNode
  detail?: React.ReactNode
}

const VIRTUAL_AFTER = 200
const ROW_PX = 36
const HEAD_PX = 32

export function ListSurface({
  className,
  children,
  ...props
}: React.ComponentProps<typeof Popover.Content>) {
  return (
    <Popover.Portal>
      <Popover.Content
        sideOffset={6}
        collisionPadding={12}
        {...props}
        className={cn(
          'z-50 flex',
          'max-h-[min(360px,var(--radix-popover-content-available-height))]',
          'min-w-[max(280px,var(--radix-popover-trigger-width))]',
          'max-w-[calc(100vw-24px)] flex-col overflow-hidden rounded-xl bg-island',
          'shadow-[0_0_0_1px_var(--border),0_16px_40px_-12px_rgb(0_0_0/0.4)]',
          className,
        )}
      >
        {children}
      </Popover.Content>
    </Popover.Portal>
  )
}

export function OptionList<T extends string>({
  id,
  options,
  selected,
  multiple,
  active,
  onActive,
  onChoose,
  empty,
  label,
  className,
  ...rest
}: {
  id: string
  options: readonly RowOption<T>[]
  selected?: string | readonly string[]
  multiple?: boolean
  active: number
  onActive: (i: number) => void
  onChoose: (o: RowOption<T>) => void
  empty: React.ReactNode
  label: string
  className?: string
} & Omit<React.HTMLAttributes<HTMLDivElement>, 'onChange'>) {
  const scroller = useRef<HTMLDivElement>(null)
  const { rows } = useMemo(() => groupRows(options), [options])
  const at = useMemo(() => {
    const out: number[] = []
    rows.forEach((r, i) => {
      if (r.kind === 'row') out[r.index] = i
    })
    return out
  }, [rows])
  const isOn = (v: string) =>
    typeof selected === 'string' ? v === selected : !!selected?.includes(v)
  const virtual = rows.length > VIRTUAL_AFTER
  const v = useVirtualizer({
    count: virtual ? rows.length : 0,
    getScrollElement: () => scroller.current,
    estimateSize: (i) => (rows[i]?.kind === 'head' ? HEAD_PX : ROW_PX),
    overscan: 8,
    paddingStart: 6,
    paddingEnd: 6,
  })

  useEffect(() => {
    if (active < 0) return
    if (virtual) v.scrollToIndex(at[active] ?? active, { align: 'auto' })
    else
      document
        .getElementById(optionId(id, active))
        ?.scrollIntoView({ block: 'nearest' })
  }, [active, virtual, v, id, at])

  const head = (label: string, key: string, style?: React.CSSProperties) => (
    <div
      key={key}
      role="presentation"
      style={style}
      className={cn(
        'flex h-8 w-full items-end truncate px-2.5 pb-1 font-medium text-faint text-sm',
        style && 'absolute top-0 left-0',
      )}
    >
      {label}
    </div>
  )

  const row = (o: RowOption<T>, i: number, style?: React.CSSProperties) => {
    const on = isOn(o.value)
    const Icon = o.icon ?? Check
    return (
      // biome-ignore lint/a11y/useKeyWithClickEvents: keys are handled where focus sits and reach rows through aria-activedescendant
      <div
        key={`${o.icon ? 'act:' : ''}${o.value}`}
        id={optionId(id, i)}
        role="option"
        tabIndex={-1}
        aria-selected={on}
        style={style}
        onMouseMove={() => i !== active && onActive(i)}
        onClick={() => onChoose(o)}
        className={cn(
          'flex h-(--row-h) w-full cursor-default select-none items-center gap-2.5 whitespace-nowrap rounded-lg px-2.5',
          i === active && 'bg-accent',
          style && 'absolute top-0 left-0',
        )}
      >
        {multiple && !o.icon ? (
          <span
            aria-hidden
            className={cn(
              'grid size-4 shrink-0 place-items-center rounded-[5px] transition-colors duration-75',
              on ? 'bg-primary text-primary-foreground' : 'bg-accent',
            )}
          >
            {on && <Check className="size-3 stroke-3" />}
          </span>
        ) : (
          <Icon
            className={cn(
              'size-4 shrink-0 text-primary',
              !o.icon && !on && 'invisible',
            )}
            aria-hidden
          />
        )}
        <span className="min-w-0 flex-1 truncate">
          {o.label}
          {o.secondary && (
            <span className="ml-2 text-faint text-sm">{o.secondary}</span>
          )}
        </span>
        {o.badge}
        {o.detail && (
          <span className="num shrink-0 text-faint text-sm">{o.detail}</span>
        )}
      </div>
    )
  }

  return (
    <div
      ref={scroller}
      id={id}
      role="listbox"
      // keep focus on the input that drives the list, or it closes under the pointer
      onMouseDown={(e) => e.preventDefault()}
      aria-label={label}
      aria-multiselectable={multiple || undefined}
      className={cn(
        'min-h-0 flex-1 overflow-auto p-1.5 outline-none',
        virtual && 'relative',
        className,
      )}
      {...rest}
    >
      {options.length === 0 && (
        <div className="px-3 py-4 text-center text-muted-foreground">
          {empty}
        </div>
      )}
      {virtual ? (
        <div
          aria-hidden
          role="presentation"
          className="relative"
          style={{ height: v.getTotalSize() - 12 }}
        />
      ) : (
        rows.map((r) =>
          r.kind === 'head'
            ? head(r.label, `head:${r.label}`)
            : row(r.option, r.index),
        )
      )}
      {virtual &&
        v.getVirtualItems().map((it) => {
          const r = rows[it.index]
          const style = {
            transform: `translate(6px, ${it.start}px)`,
            width: 'calc(100% - 12px)',
          }
          return r.kind === 'head'
            ? head(r.label, `head:${r.label}`, style)
            : row(r.option, r.index, style)
        })}
    </div>
  )
}
