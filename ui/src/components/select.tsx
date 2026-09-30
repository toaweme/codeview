import type { LucideIcon } from 'lucide-react'
import { ChevronsUpDown, X } from 'lucide-react'
import { Popover } from 'radix-ui'
import { useId, useRef, useState } from 'react'
import { cn } from '@/lib/cn'
import { navKey, optionId, typeahead } from './listbox'
import { ListSurface, OptionList, type RowOption } from './option-list'
import { Tooltip } from './tooltip'
import { useListNav } from './use-list-nav'

const TYPEAHEAD_MS = 500

export function Select<T extends string>({
  value,
  onChange,
  options,
  label,
  placeholder = 'Choose…',
  icon: Icon,
  onClear,
  align = 'start',
  className,
  trigger,
  content,
  tooltip,
}: {
  value?: T
  onChange: (value: T) => void
  options: readonly RowOption<T>[]
  label: string
  placeholder?: string
  icon?: LucideIcon
  onClear?: () => void
  align?: 'start' | 'center' | 'end'
  className?: string
  // trigger replaces the field look of the button, keeping its behavior
  trigger?: string
  // content replaces the label and chevron inside the trigger button
  content?: React.ReactNode
  tooltip?: React.ReactNode
}) {
  const listId = useId()
  const [open, setOpen] = useState(false)
  const selectedIndex = options.findIndex((o) => o.value === value)
  const [active, dispatch] = useListNav(options.length)
  const typed = useRef({ prefix: '', at: 0 })
  const current = options[selectedIndex]

  const show = (o: boolean) => {
    setOpen(o)
    if (o) dispatch({ type: 'reset', index: Math.max(selectedIndex, 0) })
  }
  const choose = (o: RowOption<T>) => {
    setOpen(false)
    onChange(o.value)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const nav = navKey(e.key)
    if (nav) {
      e.preventDefault()
      dispatch(nav)
      return
    }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      if (options[active]) choose(options[active])
      return
    }
    if (e.key.length !== 1 || e.metaKey || e.ctrlKey || e.altKey) return
    e.preventDefault()
    const now = e.timeStamp
    const t = typed.current
    t.prefix = now - t.at > TYPEAHEAD_MS ? e.key : t.prefix + e.key
    t.at = now
    dispatch({
      type: 'set',
      index: typeahead(
        options.map((o) => o.label),
        t.prefix,
        active,
      ),
    })
  }

  const button = (
    <Popover.Trigger asChild>
      <button
        type="button"
        role="combobox"
        aria-label={current ? `${label}, ${current.label}` : label}
        aria-expanded={open}
        aria-controls={listId}
        aria-haspopup="listbox"
        className={cn(
          'flex w-full min-w-0 items-center gap-2 whitespace-nowrap text-left',
          'transition-colors duration-100 focus-visible:outline-2 focus-visible:outline-ring',
          trigger ??
            'h-9 pointer-coarse:h-10 rounded-lg bg-island-muted px-3 hover:bg-hover data-[state=open]:bg-accent',
          onClear && 'pr-14',
        )}
      >
        {content ?? (
          <>
            {Icon && (
              <Icon
                className={cn(
                  'size-4 shrink-0',
                  current ? 'text-primary' : 'text-faint',
                )}
                aria-hidden
              />
            )}
            <span
              className={cn(
                'min-w-0 flex-1 truncate',
                !trigger && (current ? 'text-foreground' : 'text-faint'),
              )}
            >
              {current?.label ?? placeholder}
            </span>
            <ChevronsUpDown
              className="size-3.5 shrink-0 text-faint opacity-70"
              aria-hidden
            />
          </>
        )}
      </button>
    </Popover.Trigger>
  )

  return (
    <Popover.Root open={open} onOpenChange={show}>
      <div
        className={cn(
          'relative flex min-w-0',
          !trigger && 'h-9 pointer-coarse:h-10',
          className,
        )}
      >
        {tooltip ? (
          <Tooltip label={tooltip} side="bottom">
            {button}
          </Tooltip>
        ) : (
          button
        )}
        {onClear && current && (
          <button
            type="button"
            aria-label={`Clear ${label.toLowerCase()}`}
            onClick={onClear}
            className={cn(
              'absolute top-1.5 pointer-coarse:top-2 right-7 grid size-6 place-items-center rounded-md',
              'text-faint transition-colors duration-100',
              'hover:bg-hover hover:text-foreground',
            )}
          >
            <X className="size-3.5" aria-hidden />
          </button>
        )}
      </div>
      <ListSurface
        align={align}
        onOpenAutoFocus={(e) => {
          e.preventDefault()
          ;(e.currentTarget as HTMLElement)
            .querySelector<HTMLElement>('[role=listbox]')
            ?.focus()
        }}
      >
        <OptionList
          id={listId}
          label={label}
          options={options}
          selected={value}
          active={active}
          onActive={(i) => dispatch({ type: 'set', index: i })}
          onChoose={choose}
          empty="Nothing to choose."
          tabIndex={0}
          aria-activedescendant={
            active >= 0 ? optionId(listId, active) : undefined
          }
          onKeyDown={handleKeyDown}
        />
      </ListSurface>
    </Popover.Root>
  )
}
