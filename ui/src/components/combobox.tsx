import type { LucideIcon } from 'lucide-react'
import { ChevronsUpDown, Search, X } from 'lucide-react'
import { Popover } from 'radix-ui'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { cn } from '@/lib/cn'
import {
  filterOptions,
  groupRows,
  multiLabel,
  navKey,
  optionId,
  selectAll,
  toggleValue,
} from './listbox'
import { ListSurface, OptionList, type RowOption } from './option-list'
import { useListNav } from './use-list-nav'

type Common<T extends string> = {
  options: readonly RowOption<T>[]
  label: string
  placeholder?: string
  icon?: LucideIcon
  empty?: React.ReactNode
  className?: string
}

type Single = {
  multiple?: false
  value: string
  onChange: (value: string) => void
  freeText?: boolean
  settleMs?: number
  clearable?: boolean
  inputRef?: React.Ref<HTMLInputElement>
}

type Multiple = {
  multiple: true
  value: readonly string[]
  onChange: (value: string[]) => void
  all: string
  count: (n: number) => string
}

export function Combobox<T extends string>(
  props: Common<T> & (Single | Multiple),
) {
  return props.multiple ? (
    <MultiCombobox {...props} />
  ) : (
    <SingleCombobox {...props} />
  )
}

function SingleCombobox<T extends string>({
  value,
  onChange,
  options,
  label,
  placeholder,
  icon: Icon,
  freeText,
  settleMs = 300,
  clearable = true,
  empty = 'Nothing matches.',
  className,
  inputRef,
}: Common<T> & Single) {
  const listId = useId()
  const labelOf = (v: string) => options.find((o) => o.value === v)?.label ?? v
  const [text, setText] = useState(() => labelOf(value))
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState(false)
  const anchor = useRef<HTMLDivElement>(null)

  const list = useMemo(
    () => (typed ? filterOptions(options, text) : [...options]),
    [options, text, typed],
  )
  const [active, dispatch] = useListNav(list.length)

  const lastSent = useRef(value)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const send = useRef((v: string) => {
    lastSent.current = v
    onChangeRef.current(v)
  })

  // biome-ignore lint/correctness/useExhaustiveDependencies: only an outside value change resets the text
  useEffect(() => {
    const isEchoOfLastSent = value === lastSent.current
    if (isEchoOfLastSent) return
    lastSent.current = value
    setText(labelOf(value))
    setTyped(false)
  }, [value])

  useEffect(() => {
    if (!freeText || !typed || text.trim() === lastSent.current) return
    const timer = setTimeout(() => send.current(text.trim()), settleMs)
    return () => clearTimeout(timer)
  }, [text, typed, freeText, settleMs])

  const show = (o: boolean) => {
    setOpen(o)
    if (!o) return
    setTyped(false)
    dispatch({
      type: 'reset',
      index: options.findIndex((x) => x.value === value),
    })
  }
  const choose = (o: RowOption<T>) => {
    setText(o.label)
    setTyped(false)
    setOpen(false)
    send.current(o.value)
  }
  const clear = () => {
    setText('')
    setTyped(false)
    send.current('')
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const nav = navKey(e.key)
    // Home and End move the caret until a row is active
    if (nav && (nav.type === 'next' || nav.type === 'prev' || active >= 0)) {
      e.preventDefault()
      if (!open) show(true)
      else dispatch(nav)
      return
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      if (open && list[active]) choose(list[active])
      else if (freeText) {
        send.current(text.trim())
        setOpen(false)
      }
      return
    }
    if (e.key !== 'Escape') return
    e.preventDefault()
    e.stopPropagation()
    if (text) clear()
    else if (open) setOpen(false)
    else e.currentTarget.blur()
  }

  return (
    <Popover.Root open={open} onOpenChange={show}>
      <Popover.Anchor asChild>
        <div
          ref={anchor}
          className={cn(
            'relative flex h-9 min-w-0 items-center rounded-lg bg-island-muted',
            'text-faint transition-colors duration-100',
            'focus-within:ring-2 focus-within:ring-ring/40 hover:text-muted-foreground',
            className,
          )}
        >
          {Icon && (
            <Icon
              className="pointer-events-none absolute left-2.5 size-4 shrink-0"
              aria-hidden
            />
          )}
          <input
            ref={inputRef}
            value={text}
            role="combobox"
            aria-label={label}
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={
              open && active >= 0 ? optionId(listId, active) : undefined
            }
            autoComplete="off"
            spellCheck={false}
            placeholder={placeholder}
            onChange={(e) => {
              setText(e.target.value)
              setTyped(true)
              setOpen(true)
              dispatch({ type: 'reset', index: freeText ? -1 : 0 })
            }}
            onPointerDown={() => !open && show(true)}
            onBlur={() => setOpen(false)}
            onKeyDown={handleKeyDown}
            className={cn(
              'h-full min-w-0 flex-1 truncate bg-transparent text-foreground outline-none placeholder:text-faint',
              Icon ? 'pl-9' : 'pl-3',
              clearable ? 'pr-14' : 'pr-8',
            )}
          />
          {clearable && text && (
            <button
              type="button"
              tabIndex={-1}
              aria-label={`Clear ${label.toLowerCase()}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={clear}
              className={cn(
                'absolute right-7 grid size-6 place-items-center rounded-md',
                'text-faint transition-colors duration-100',
                'hover:bg-hover hover:text-foreground',
              )}
            >
              <X className="size-3.5" aria-hidden />
            </button>
          )}
          <ChevronsUpDown
            className="pointer-events-none absolute right-2.5 size-3.5 shrink-0 opacity-70"
            aria-hidden
          />
        </div>
      </Popover.Anchor>
      <ListSurface
        align="start"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
        // the input handles Esc so the first press clears the text
        onEscapeKeyDown={(e) => e.preventDefault()}
        onInteractOutside={(e) => {
          if (anchor.current?.contains(e.target as Node)) e.preventDefault()
        }}
      >
        <OptionList
          id={listId}
          label={label}
          options={list}
          selected={value}
          active={active}
          onActive={(i) => dispatch({ type: 'set', index: i })}
          onChoose={choose}
          empty={empty}
        />
      </ListSurface>
    </Popover.Root>
  )
}

function MultiCombobox<T extends string>({
  value,
  onChange,
  options,
  label,
  placeholder = 'Filter',
  icon: Icon,
  empty = 'Nothing matches.',
  className,
  all,
  count,
}: Common<T> & Multiple) {
  const listId = useId()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const list = useMemo(
    () => groupRows(filterOptions(options, text)).order,
    [options, text],
  )
  const [active, dispatch] = useListNav(list.length)
  const picked = options.filter((o) => value.includes(o.value)).length

  const show = (o: boolean) => {
    setOpen(o)
    if (!o) return
    setText('')
    dispatch({ type: 'reset', index: 0 })
  }
  const toggle = (o: RowOption<T>) => onChange(toggleValue(value, o.value))

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const nav = navKey(e.key)
    if (nav && (nav.type === 'next' || nav.type === 'prev' || active >= 0)) {
      e.preventDefault()
      dispatch(nav)
      return
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      if (list[active]) toggle(list[active])
      return
    }
    if (e.key !== 'Escape') return
    e.preventDefault()
    e.stopPropagation()
    if (text) {
      setText('')
      dispatch({ type: 'reset', index: 0 })
    } else setOpen(false)
  }

  const action = [
    'rounded-md px-2 py-1 text-muted-foreground text-sm',
    'transition-colors duration-100 hover:bg-hover hover:text-foreground',
    'disabled:pointer-events-none disabled:opacity-50',
  ].join(' ')

  return (
    <Popover.Root open={open} onOpenChange={show}>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={`${label}, ${multiLabel(value, options, all, count)}`}
          aria-haspopup="listbox"
          aria-expanded={open}
          className={cn(
            'flex h-9 min-w-0 items-center gap-2 whitespace-nowrap rounded-lg',
            'bg-island-muted px-3 text-left transition-colors duration-100',
            'hover:bg-hover focus-visible:outline-2 focus-visible:outline-ring',
            'data-[state=open]:bg-accent',
            className,
          )}
        >
          {Icon && (
            <Icon
              className={cn(
                'size-4 shrink-0',
                picked > 0 ? 'text-primary' : 'text-faint',
              )}
              aria-hidden
            />
          )}
          <span className="min-w-0 flex-1 truncate text-foreground">
            {multiLabel(value, options, all, count)}
          </span>
          <ChevronsUpDown
            className="size-3.5 shrink-0 text-faint opacity-70"
            aria-hidden
          />
        </button>
      </Popover.Trigger>
      <ListSurface
        align="start"
        onOpenAutoFocus={(e) => {
          e.preventDefault()
          ;(e.currentTarget as HTMLElement)
            .querySelector<HTMLInputElement>('input')
            ?.focus()
        }}
        // the input handles Esc so the first press clears the text
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <div className="flex shrink-0 flex-col gap-1 p-1.5 pb-0">
          <div
            className={cn(
              'relative flex h-9 items-center rounded-lg bg-island-muted',
              'text-faint focus-within:ring-2 focus-within:ring-ring/40',
            )}
          >
            <Search
              className="pointer-events-none absolute left-2.5 size-4 shrink-0"
              aria-hidden
            />
            <input
              value={text}
              role="combobox"
              aria-label={`Filter ${label.toLowerCase()}`}
              aria-expanded
              aria-controls={listId}
              aria-autocomplete="list"
              aria-activedescendant={
                active >= 0 ? optionId(listId, active) : undefined
              }
              autoComplete="off"
              spellCheck={false}
              placeholder={placeholder}
              onChange={(e) => {
                setText(e.target.value)
                dispatch({ type: 'reset', index: 0 })
              }}
              onKeyDown={handleKeyDown}
              className="h-full min-w-0 flex-1 bg-transparent pr-3 pl-9 text-foreground outline-none placeholder:text-faint"
            />
          </div>
          <div className="flex h-8 items-center gap-1">
            <button
              type="button"
              disabled={list.every((o) => value.includes(o.value))}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onChange(selectAll(value, list))}
              className={action}
            >
              {text ? 'Select matches' : 'Select all'}
            </button>
            <button
              type="button"
              disabled={value.length === 0}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onChange([])}
              className={action}
            >
              Clear
            </button>
            <span className="num ml-auto whitespace-nowrap px-2 text-faint text-sm">
              {picked > 0
                ? `${picked.toLocaleString()} of ${options.length.toLocaleString()}`
                : options.length.toLocaleString()}
            </span>
          </div>
        </div>
        <OptionList
          id={listId}
          label={label}
          options={list}
          selected={value}
          multiple
          active={active}
          onActive={(i) => dispatch({ type: 'set', index: i })}
          onChoose={toggle}
          empty={empty}
        />
      </ListSurface>
    </Popover.Root>
  )
}
