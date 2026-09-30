import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import {
  ChevronsUpDown,
  GitBranch,
  GitCommitHorizontal,
  Tag,
} from 'lucide-react'
import { Popover } from 'radix-ui'
import { useEffect, useId, useMemo, useState } from 'react'
import { type ResolvedRef, revisionQuery } from '@/api/queries'
import type { Refs } from '@/api/types'
import { Badge } from '@/components/badge'
import { filterOptions, navKey, optionId } from '@/components/listbox'
import {
  ListSurface,
  OptionList,
  type RowOption,
} from '@/components/option-list'
import { useListNav } from '@/components/use-list-nav'
import { cn } from '@/lib/cn'
import { shortHash } from '@/lib/format'
import { relativeTime } from '@/lib/time'
import { isCommitHash, isRevision, type RepoView, repoLink } from '@/lib/url'

type RefView = Extract<RepoView, { ref?: string; path: string }>

type Tab = 'branches' | 'tags'

export function RefSwitcher({
  repo,
  view,
  resolved,
  refs,
}: {
  repo: string
  view: RefView
  resolved: ResolvedRef | null
  refs?: Refs
}) {
  const navigate = useNavigate()
  const Icon =
    resolved?.kind === 'tag'
      ? Tag
      : resolved?.kind === 'commit'
        ? GitCommitHorizontal
        : GitBranch
  const label =
    resolved?.kind === 'commit'
      ? resolved.name.slice(0, 10)
      : (resolved?.name ?? '…')

  return (
    <RefPicker
      refs={refs}
      current={resolved?.name}
      onChoose={(name) =>
        navigate(
          repoLink(repo, {
            ...view,
            ref: refs && name === refs.default ? undefined : name,
          }),
        )
      }
    >
      <button
        type="button"
        aria-label={`Switch branch or tag, current ${label}`}
        className={cn(
          'flex h-8 pointer-coarse:h-10 min-w-0 max-w-full items-center gap-1.5 rounded-lg',
          'bg-primary/12 px-2.5 font-medium text-primary text-sm transition-colors duration-100',
          'hover:bg-primary/18 focus-visible:outline-2 focus-visible:outline-ring',
          'data-[state=open]:bg-primary/18',
        )}
      >
        <Icon className="size-4 shrink-0" aria-hidden />
        <span className="truncate">{label}</span>
        <ChevronsUpDown className="size-3.5 shrink-0 opacity-70" aria-hidden />
      </button>
    </RefPicker>
  )
}

export function RefPicker({
  refs,
  current,
  onChoose,
  children,
  align = 'start',
  revisionsIn,
}: {
  refs?: Refs
  current?: string
  onChoose: (name: string) => void
  children: React.ReactNode
  align?: 'start' | 'center' | 'end'
  revisionsIn?: string
}) {
  const listId = useId()
  const [open, setOpen] = useState(false)
  const initialTab: Tab = refs?.tags.some((t) => t.name === current)
    ? 'tags'
    : 'branches'
  const [tab, setTab] = useState<Tab>(initialTab)
  const [filter, setFilter] = useState('')

  const list = useMemo(() => {
    const all = refs ? (tab === 'branches' ? refs.branches : refs.tags) : []
    const sorted = [...all].sort((a, b) =>
      tab === 'branches' && refs && a.name === refs.default
        ? -1
        : tab === 'branches' && refs && b.name === refs.default
          ? 1
          : Date.parse(b.updated_at ?? '') - Date.parse(a.updated_at ?? ''),
    )
    const out: RowOption[] = filterOptions(
      sorted.map((r) => ({
        value: r.name,
        label: r.name,
        updatedAt: r.updated_at,
      })),
      filter,
    ).map((r) => ({
      value: r.value,
      label: r.label,
      badge: refs && r.value === refs.default && (
        <Badge tone="primary">default</Badge>
      ),
      detail: r.updatedAt && relativeTime(r.updatedAt),
    }))
    const f = filter.trim().toLowerCase()
    const exact =
      refs &&
      [...refs.branches, ...refs.tags].some((r) => r.name.toLowerCase() === f)
    const typed = filter.trim()
    if (revisionsIn && isRevision(typed))
      out.unshift({
        value: typed,
        label: `Use ${typed}`,
        icon: GitCommitHorizontal,
      })
    else if (!exact && isCommitHash(f))
      out.unshift({
        value: f,
        label: `Use commit ${f.slice(0, 12)}`,
        icon: GitCommitHorizontal,
      })
    return out
  }, [refs, tab, filter, revisionsIn])

  const typed = filter.trim()
  const preview =
    revisionsIn && (isRevision(typed) || isCommitHash(typed.toLowerCase()))
      ? typed
      : ''
  const [settled, setSettled] = useState('')
  useEffect(() => {
    const t = setTimeout(() => setSettled(preview), 200)
    return () => clearTimeout(t)
  }, [preview])
  const [active, dispatch] = useListNav(list.length, 0)

  const choose = (name: string) => {
    setOpen(false)
    setFilter('')
    onChoose(name)
  }

  const switchTab = (t: Tab) => {
    setTab(t)
    dispatch({ type: 'reset', index: 0 })
  }

  return (
    <Popover.Root
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        dispatch({ type: 'reset', index: 0 })
        if (o) setTab(initialTab)
        else setFilter('')
      }}
    >
      <Popover.Trigger asChild>{children}</Popover.Trigger>
      <ListSurface
        align={align}
        className="w-80"
        onEscapeKeyDown={(e) => {
          if (!filter) return
          e.preventDefault()
          setFilter('')
          dispatch({ type: 'reset', index: 0 })
        }}
        onOpenAutoFocus={(e) => {
          e.preventDefault()
          ;(e.currentTarget as HTMLElement).querySelector('input')?.focus()
        }}
      >
        <div className="m-1.5 mb-0 shrink-0 rounded-lg bg-island-muted p-1.5">
          <input
            value={filter}
            role="combobox"
            aria-label={`Filter ${tab} or paste a commit hash`}
            aria-expanded
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={
              active >= 0 ? optionId(listId, active) : undefined
            }
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => {
              setFilter(e.target.value)
              dispatch({ type: 'reset', index: 0 })
            }}
            onKeyDown={(e) => {
              const nav = navKey(e.key)
              if (nav) {
                e.preventDefault()
                dispatch(nav)
              } else if (e.key === 'Enter' && list[active]) {
                e.preventDefault()
                choose(list[active].value)
              } else if (e.key === 'Tab') {
                e.preventDefault()
                switchTab(tab === 'branches' ? 'tags' : 'branches')
              }
            }}
            placeholder={`Filter ${tab} or paste a hash`}
            className="h-9 w-full rounded-md bg-background px-3 outline-none placeholder:text-faint focus:ring-2 focus:ring-ring/40"
          />
          {revisionsIn && preview && (
            <RevisionPreview
              repo={revisionsIn}
              rev={preview}
              settled={settled === preview}
            />
          )}
          <div className="mt-1.5 flex gap-0.5">
            {(['branches', 'tags'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => switchTab(t)}
                className={cn(
                  'flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md',
                  'text-muted-foreground text-sm capitalize transition-colors duration-100',
                  'hover:text-foreground',
                  tab === t &&
                    'bg-background font-medium text-foreground shadow-[0_1px_2px_rgb(0_0_0/0.08)]',
                )}
              >
                {t}
                <span className="num text-faint text-xs">
                  {refs ? refs[t].length : ''}
                </span>
              </button>
            ))}
          </div>
        </div>
        <OptionList
          id={listId}
          label={tab === 'branches' ? 'Branches' : 'Tags'}
          options={list}
          selected={current}
          active={active}
          onActive={(i) => dispatch({ type: 'set', index: i })}
          onChoose={(o) => choose(o.value)}
          empty={refs ? 'Nothing matches.' : 'Loading refs…'}
        />
      </ListSurface>
    </Popover.Root>
  )
}

function RevisionPreview({
  repo,
  rev,
  settled,
}: {
  repo: string
  rev: string
  settled: boolean
}) {
  const q = useQuery({ ...revisionQuery(repo, rev), enabled: settled })
  return (
    <div
      aria-live="polite"
      className="mt-1.5 flex h-7 min-w-0 items-center gap-2 overflow-hidden whitespace-nowrap px-1 text-sm"
    >
      {q.data ? (
        <>
          <Badge>{shortHash(q.data.hash)}</Badge>
          <span className="min-w-0 truncate text-muted-foreground">
            {q.data.subject}
          </span>
        </>
      ) : q.isError || q.data === null ? (
        <span className="truncate text-faint">
          {rev} does not name a commit
        </span>
      ) : (
        <span className="truncate text-faint">Resolving {rev}…</span>
      )}
    </div>
  )
}
