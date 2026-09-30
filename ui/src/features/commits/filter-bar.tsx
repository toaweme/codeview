import type { LucideIcon } from 'lucide-react'
import { MessageSquareText, UserRound, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Badge } from '@/components/badge'
import { Combobox } from '@/components/combobox'
import { cn } from '@/lib/cn'
import { escapeAction } from '@/lib/search'
import { DateRangeControl, type RangeChange } from './date-range'
import { dateRange, filterLabel, type HistoryFilter } from './filters'

const SETTLE_MS = 300

export type AuthorCount = { name: string; email: string; count: number }

export function FilterBar({
  filter,
  now,
  authors,
  onChange,
}: {
  filter: HistoryFilter
  now: Date
  authors: AuthorCount[]
  onChange: (patch: Partial<HistoryFilter>) => void
}) {
  const options = useMemo(
    () =>
      authors.map((a) => ({
        value: a.name,
        label: a.name,
        secondary: a.email,
        badge: <Badge>{a.count.toLocaleString()}</Badge>,
      })),
    [authors],
  )
  const handleRange = (c: RangeChange) => {
    if (c.kind === 'preset')
      onChange({ range: c.id, since: undefined, until: undefined })
    else if (c.kind === 'days')
      onChange({ range: undefined, since: c.since, until: c.until })
    else onChange({ date: c.field === 'committer' ? 'committer' : undefined })
  }
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <DateRangeControl filter={filter} now={now} onChange={handleRange} />
      <Combobox
        icon={UserRound}
        label="Author"
        placeholder="Author"
        value={filter.author ?? ''}
        onChange={(author) => onChange({ author: author || undefined })}
        options={options}
        freeText
        settleMs={SETTLE_MS}
        empty="No loaded commit by that author. Enter searches anyway."
        className="min-w-0 flex-1 basis-36 sm:w-48 sm:flex-none sm:shrink"
      />
      <FilterField
        icon={MessageSquareText}
        label="Search commit messages"
        placeholder="Search messages"
        value={filter.grep ?? ''}
        onCommit={(grep) => onChange({ grep: grep || undefined })}
        className="min-w-0 flex-1 basis-36 sm:w-72 sm:min-w-24 sm:flex-none sm:shrink"
      />
    </div>
  )
}

function FilterField({
  icon: Icon,
  label,
  placeholder,
  value,
  onCommit,
  className,
}: {
  icon: LucideIcon
  label: string
  placeholder: string
  value: string
  onCommit: (value: string) => void
  className?: string
}) {
  const [text, setText] = useState(value)
  // so our own value echoing back through the URL never overwrites newer typing
  const sent = useRef(value)
  const handler = useRef(onCommit)
  handler.current = onCommit
  const commit = useRef((v: string) => {
    sent.current = v
    handler.current(v)
  })
  useEffect(() => {
    if (value !== sent.current) {
      sent.current = value
      setText(value)
    }
  }, [value])
  useEffect(() => {
    if (text.trim() === sent.current) return
    const t = setTimeout(() => commit.current(text.trim()), SETTLE_MS)
    return () => clearTimeout(t)
  }, [text])

  return (
    <div
      className={cn(
        'relative flex items-center rounded-lg',
        'h-9 min-w-0 pointer-coarse:h-10',
        'bg-island-muted text-faint',
        'transition-colors duration-100',
        'focus-within:ring-2 focus-within:ring-ring/40',
        'hover:text-muted-foreground',
        className,
      )}
    >
      <Icon
        className="pointer-events-none absolute left-2.5 size-4 shrink-0"
        aria-hidden
      />
      <input
        value={text}
        aria-label={label}
        placeholder={placeholder}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            commit.current(text.trim())
            return
          }
          if (e.key !== 'Escape') return
          e.preventDefault()
          e.stopPropagation()
          if (escapeAction(text) === 'clear') {
            setText('')
            commit.current('')
          } else e.currentTarget.blur()
        }}
        className={cn(
          'flex-1',
          'h-full min-w-0 pr-8 pl-9',
          'truncate bg-transparent text-foreground outline-none',
          'placeholder:text-faint',
        )}
      />
      {text && (
        <button
          type="button"
          aria-label={`Clear ${label.toLowerCase()}`}
          onClick={() => {
            setText('')
            commit.current('')
          }}
          className={cn(
            'absolute grid place-items-center rounded-md',
            'right-1.5 size-6 pointer-coarse:size-8',
            'text-faint',
            'transition-colors duration-100 hover:bg-hover hover:text-foreground',
          )}
        >
          <X className="size-3.5" aria-hidden />
        </button>
      )}
    </div>
  )
}

export function FilterPills({
  filter,
  now,
  onChange,
}: {
  filter: HistoryFilter
  now: Date
  onChange: (patch: Partial<HistoryFilter>) => void
}) {
  const r = dateRange(filter, now)
  const pills: {
    key: string
    label: string
    clear: Partial<HistoryFilter>
    tone: 'primary' | 'neutral'
  }[] = []
  if (r.since || r.until)
    pills.push({
      key: 'range',
      label: filterLabel(filter, now),
      clear: { range: undefined, since: undefined, until: undefined },
      tone: 'primary',
    })
  if (filter.author)
    pills.push({
      key: 'author',
      label: `Author ${filter.author}`,
      clear: { author: undefined },
      tone: 'neutral',
    })
  if (filter.grep)
    pills.push({
      key: 'grep',
      label: `Message "${filter.grep}"`,
      clear: { grep: undefined },
      tone: 'neutral',
    })
  if (filter.date === 'committer')
    pills.push({
      key: 'date',
      label: 'By committer date',
      clear: { date: undefined },
      tone: 'neutral',
    })
  if (pills.length === 0) return null
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5 pt-2">
      {pills.map((p) => (
        <span
          key={p.key}
          className={cn(
            'flex shrink items-center rounded-md',
            'h-7 min-w-0 max-w-64 gap-1 pr-0.5 pl-2.5 pointer-coarse:h-9',
            'whitespace-nowrap font-medium text-sm num',
            p.tone === 'primary'
              ? 'bg-primary/12 text-primary'
              : 'bg-accent text-muted-foreground',
          )}
        >
          <span className="min-w-0 truncate">{p.label}</span>
          <button
            type="button"
            aria-label={`Remove ${p.label}`}
            onClick={() => onChange(p.clear)}
            className={cn(
              'grid shrink-0 place-items-center rounded-sm',
              'size-6 pointer-coarse:size-8',
              'transition-colors duration-100',
              'hover:bg-hover hover:text-foreground',
              'focus-visible:outline-2 focus-visible:outline-ring',
            )}
          >
            <X className="size-3.5" aria-hidden />
          </button>
        </span>
      ))}
      {pills.length > 1 && (
        <button
          type="button"
          onClick={() =>
            onChange({
              range: undefined,
              since: undefined,
              until: undefined,
              author: undefined,
              grep: undefined,
              date: undefined,
            })
          }
          className={cn(
            'shrink-0 rounded-md',
            'h-7 px-2 pointer-coarse:h-9',
            'whitespace-nowrap text-muted-foreground text-sm',
            'transition-colors duration-100 hover:bg-hover hover:text-foreground',
          )}
        >
          Clear all
        </button>
      )}
    </div>
  )
}
