import {
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { Popover } from 'radix-ui'
import { useId, useMemo, useRef, useState } from 'react'
import { Segmented } from '@/components/segmented'
import { cn } from '@/lib/cn'
import {
  describeRange,
  localeOrder,
  orderRange,
  parseDateInput,
} from './date-input'
import {
  type DateField,
  type DateRange,
  dateField,
  dateRange,
  filterLabel,
  type HistoryFilter,
  monthGrid,
  PRESETS,
  type PresetId,
  parseISODate,
  toISODate,
} from './filters'

const monthFmt = new Intl.DateTimeFormat('en', {
  month: 'long',
  year: 'numeric',
})
const dayNameFmt = new Intl.DateTimeFormat('en', { weekday: 'narrow' })
const dayLongFmt = new Intl.DateTimeFormat('en', { dateStyle: 'full' })
// 2024-01-01 is a Monday
const WEEKDAYS = Array.from({ length: 7 }, (_, i) =>
  dayNameFmt.format(new Date(2024, 0, 1 + i)),
)

export type RangeChange =
  | { kind: 'preset'; id: PresetId }
  | { kind: 'days'; since?: string; until?: string }
  | { kind: 'field'; field: DateField }

export function DateRangeControl({
  filter,
  onChange,
  now,
}: {
  filter: HistoryFilter
  onChange: (c: RangeChange) => void
  now: Date
}) {
  const [open, setOpen] = useState(false)
  const revert = useRef(() => false)
  const active = !!(filter.range || filter.since || filter.until)
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          className={cn(
            'flex shrink-0 items-center rounded-lg',
            'h-9 w-full gap-2 px-3 sm:w-56 pointer-coarse:h-10',
            'whitespace-nowrap text-sm',
            'transition-colors duration-100',
            'focus-visible:outline-2 focus-visible:outline-ring',
            'data-[state=open]:bg-accent',
            active
              ? 'bg-active text-foreground hover:bg-active'
              : 'bg-island-muted text-muted-foreground hover:bg-hover hover:text-foreground',
          )}
        >
          <CalendarDays
            className={cn(
              'size-4 shrink-0',
              active ? 'text-primary' : 'text-faint',
            )}
            aria-hidden
          />
          <span className="num min-w-0 flex-1 truncate text-left">
            {filterLabel(filter, now)}
          </span>
          <ChevronDown className="size-4 shrink-0 text-faint" aria-hidden />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={6}
          collisionPadding={12}
          className={cn(
            'z-50 flex flex-col overflow-y-auto rounded-xl',
            'max-h-(--radix-popover-content-available-height) max-w-[calc(100vw-24px)]',
            'bg-island shadow-[0_0_0_1px_var(--border),0_16px_40px_-12px_rgb(0_0_0/0.4)]',
          )}
          onEscapeKeyDown={(e) => {
            if (revert.current()) e.preventDefault()
          }}
        >
          {open && (
            <RangePanel
              filter={filter}
              now={now}
              revert={revert}
              onChange={(c) => {
                onChange(c)
                if (c.kind !== 'field') setOpen(false)
              }}
            />
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}

type End = 'since' | 'until'

function RangePanel({
  filter,
  now,
  onChange,
  revert,
}: {
  filter: HistoryFilter
  now: Date
  onChange: (c: RangeChange) => void
  revert: React.RefObject<() => boolean>
}) {
  const current = dateRange(filter, now)
  const anchor = parseISODate(current.until ?? current.since ?? '') ?? now
  const [month, setMonth] = useState({
    y: anchor.getFullYear(),
    m: anchor.getMonth(),
  })
  const [start, setStart] = useState<string | null>(null)
  const [hover, setHover] = useState<string | null>(null)
  const order = useMemo(() => localeOrder(), [])
  const [draft, setDraft] = useState<DateRange | null>(null)
  const [texts, setTexts] = useState<Record<End, string | null>>({
    since: null,
    until: null,
  })
  const editing = useRef<{ end: End; before: DateRange | null } | null>(null)
  const fromField = useRef<HTMLInputElement>(null)
  const base = draft ?? current
  const shown: DateRange = start
    ? hover && hover < start
      ? { since: hover, until: start }
      : { since: start, until: hover ?? start }
    : base
  const invalid = (end: End) => {
    const t = texts[end]
    return t !== null && parseDateInput(t, now, order).kind === 'invalid'
  }
  const bad = invalid('since') ? 'since' : invalid('until') ? 'until' : null

  revert.current = () => {
    const e = editing.current
    if (!e || texts[e.end] === null) return false
    setTexts({ since: null, until: null })
    setDraft(e.before)
    return true
  }

  const jump = (iso: string) => {
    const d = parseISODate(iso)
    if (d) setMonth({ y: d.getFullYear(), m: d.getMonth() })
  }
  const type = (end: End, text: string) => {
    setStart(null)
    const p = parseDateInput(text, now, order)
    if (p.kind === 'span' && p.range) {
      setTexts({ since: null, until: null, [end]: text })
      setDraft(p.span)
      jump(end === 'since' ? p.span.since : p.span.until)
      return
    }
    setTexts((t) => ({ ...t, [end]: text }))
    if (p.kind === 'invalid') return
    const at = p.kind === 'span' ? p.span[end] : undefined
    setDraft({ ...base, [end]: at })
    if (at) jump(at)
  }
  const settle = (end: End) => {
    if (!invalid(end)) setTexts((t) => ({ ...t, [end]: null }))
  }
  const apply = () => {
    if (bad) return
    onChange({ kind: 'days', ...orderRange(base) })
  }
  const today = toISODate(now)
  const custom = !filter.range && !!(filter.since || filter.until)

  const pick = (day: string) => {
    if (!start) {
      setStart(day)
      setDraft(null)
      setTexts({ since: null, until: null })
      return
    }
    const [since, until] = day < start ? [day, start] : [start, day]
    onChange({ kind: 'days', since, until })
  }
  const step = (n: number) =>
    setMonth(({ y, m }) => {
      const d = new Date(y, m + n, 1)
      return { y: d.getFullYear(), m: d.getMonth() }
    })

  return (
    <>
      <div className="flex flex-col sm:flex-row">
        <ul className="flex shrink-0 flex-wrap gap-0.5 p-1.5 sm:w-40 sm:flex-col sm:flex-nowrap">
          <PresetItem
            label="Any time"
            on={!filter.range && !filter.since && !filter.until}
            onClick={() => onChange({ kind: 'days' })}
          />
          {PRESETS.map((p) => (
            <PresetItem
              key={p.id}
              label={p.label}
              on={filter.range === p.id}
              onClick={() => onChange({ kind: 'preset', id: p.id })}
            />
          ))}
          <PresetItem
            label="Custom"
            on={custom}
            onClick={() => {
              setStart(null)
              fromField.current?.focus()
            }}
          />
        </ul>
        <div className="w-full p-3 pt-1.5 sm:w-[296px] sm:pt-3 sm:pl-1.5">
          <div className="grid grid-cols-[1fr_1fr_auto] gap-1.5">
            {(['since', 'until'] as const).map((end) => (
              <DayInput
                key={end}
                end={end}
                inputRef={end === 'since' ? fromField : undefined}
                text={texts[end] ?? shown[end] ?? ''}
                invalid={invalid(end)}
                picking={end === 'since' ? !start : !!start}
                onFocus={() => {
                  editing.current = { end, before: draft }
                }}
                onType={(t) => type(end, t)}
                onBlur={() => settle(end)}
                onEnter={apply}
              />
            ))}
            <button
              type="button"
              onClick={apply}
              disabled={!!bad}
              className={cn(
                'rounded-lg',
                'h-12 px-3',
                'bg-primary font-medium text-primary-foreground text-sm',
                'transition-opacity duration-100',
                'hover:opacity-90',
                'focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2',
                'disabled:opacity-40',
              )}
            >
              Apply
            </button>
          </div>
          <p
            aria-live="polite"
            className={cn(
              'num mt-1.5 mb-1 h-4 truncate px-0.5 text-xs',
              bad ? 'text-warn' : 'text-muted-foreground',
            )}
          >
            {bad
              ? `Can't read "${texts[bad]}". Try 2026-08-01, 2026-08, 7d or a range.`
              : describeRange(orderRange(shown))}
          </p>
          <div className="flex h-9 items-center justify-between">
            <button
              type="button"
              aria-label="Previous month"
              onClick={() => step(-1)}
              className={cn(
                'grid place-items-center rounded-md',
                'size-8',
                'text-muted-foreground',
                'transition-colors hover:bg-hover hover:text-foreground',
              )}
            >
              <ChevronLeft className="size-4" aria-hidden />
            </button>
            <span className="font-medium text-sm">
              {monthFmt.format(new Date(month.y, month.m, 1))}
            </span>
            <button
              type="button"
              aria-label="Next month"
              onClick={() => step(1)}
              className={cn(
                'grid place-items-center rounded-md',
                'size-8',
                'text-muted-foreground',
                'transition-colors hover:bg-hover hover:text-foreground',
              )}
            >
              <ChevronRight className="size-4" aria-hidden />
            </button>
          </div>
          <div className="grid grid-cols-7 text-center text-faint text-xs">
            {WEEKDAYS.map((d, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: narrow weekday names repeat
              <span key={i} className="grid h-7 place-items-center">
                {d}
              </span>
            ))}
          </div>
          {/* biome-ignore lint/a11y/noStaticElementInteractions: clears the hover preview only */}
          <div
            className="grid grid-cols-7 gap-y-0.5"
            onMouseLeave={() => setHover(null)}
          >
            {monthGrid(month.y, month.m).map((d) => {
              const day = toISODate(d)
              const inMonth = d.getMonth() === month.m
              const edge = day === shown.since || day === shown.until
              const within =
                !!shown.since &&
                !!shown.until &&
                day > shown.since &&
                day < shown.until
              return (
                <button
                  key={day}
                  type="button"
                  aria-label={dayLongFmt.format(d)}
                  aria-pressed={edge || within}
                  onClick={() => pick(day)}
                  onMouseEnter={() => start && setHover(day)}
                  onFocus={() => start && setHover(day)}
                  className={cn(
                    'relative grid place-items-center',
                    'h-8 pointer-coarse:h-10',
                    'num text-sm',
                    'transition-colors duration-75',
                    'focus-visible:z-[1] focus-visible:outline-2 focus-visible:outline-ring',
                    edge
                      ? 'rounded-md bg-primary font-medium text-primary-foreground'
                      : within
                        ? 'bg-active text-foreground'
                        : 'rounded-md hover:bg-hover',
                    !edge && !within && !inMonth && 'text-faint',
                    !edge && day === today && 'font-semibold text-primary',
                  )}
                >
                  {d.getDate()}
                </button>
              )
            })}
          </div>
        </div>
      </div>
      <div
        className={cn(
          'flex items-center justify-between rounded-b-xl',
          'gap-3 px-3 py-2',
          'bg-island-muted',
        )}
      >
        <span className="whitespace-nowrap text-muted-foreground text-sm">
          Match dates by
        </span>
        <Segmented<DateField>
          value={dateField(filter)}
          onChange={(field) => onChange({ kind: 'field', field })}
          options={[
            {
              value: 'author',
              label: 'Author',
              title: 'When the change was written, kept through rebases',
            },
            {
              value: 'committer',
              label: 'Committer',
              title: 'When the commit landed on this history',
            },
          ]}
        />
      </div>
    </>
  )
}

function PresetItem({
  label,
  on,
  onClick,
}: {
  label: string
  on: boolean
  onClick: () => void
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className={cn(
          'flex items-center rounded-md',
          'h-8 w-full gap-2 px-2.5 pointer-coarse:h-10',
          'whitespace-nowrap text-left text-sm',
          'transition-colors duration-75 focus-visible:outline-2 focus-visible:outline-ring',
          on
            ? 'bg-active font-medium text-foreground'
            : 'text-muted-foreground hover:bg-hover hover:text-foreground',
        )}
      >
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {on && <Check className="size-4 shrink-0 text-primary" aria-hidden />}
      </button>
    </li>
  )
}

function DayInput({
  end,
  text,
  invalid,
  picking,
  inputRef,
  onFocus,
  onType,
  onBlur,
  onEnter,
}: {
  end: End
  text: string
  invalid: boolean
  picking: boolean
  inputRef?: React.Ref<HTMLInputElement>
  onFocus: () => void
  onType: (text: string) => void
  onBlur: () => void
  onEnter: () => void
}) {
  const id = useId()
  const label = end === 'since' ? 'From' : 'To'
  return (
    <div
      className={cn(
        'flex flex-col justify-center rounded-lg',
        'h-12 min-w-0 px-2.5',
        'transition-colors duration-100 focus-within:ring-2 focus-within:ring-ring/40',
        picking ? 'bg-active' : 'bg-island-muted',
        invalid && 'ring-2 ring-warn/50 focus-within:ring-warn/50',
      )}
    >
      <label htmlFor={id} className="text-faint text-xs">
        {label}
      </label>
      <input
        id={id}
        ref={inputRef}
        value={text}
        aria-invalid={invalid}
        autoComplete="off"
        spellCheck={false}
        placeholder="Open"
        onFocus={(e) => {
          onFocus()
          e.currentTarget.select()
        }}
        onChange={(e) => onType(e.target.value)}
        onBlur={onBlur}
        onKeyDown={(e) => {
          if (e.key !== 'Enter') return
          e.preventDefault()
          onEnter()
        }}
        className={cn(
          'w-full min-w-0',
          'num truncate bg-transparent text-sm outline-none',
          'placeholder:text-faint',
        )}
      />
    </div>
  )
}
