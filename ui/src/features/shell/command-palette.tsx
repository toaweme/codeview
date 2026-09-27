import { noop, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import {
  Book,
  CornerDownLeft,
  File,
  GitBranch,
  type LucideIcon,
  Tag,
  Zap,
} from 'lucide-react'
import { Dialog } from 'radix-ui'
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import {
  blobQuery,
  filesQuery,
  type ResolvedRef,
  reposQuery,
} from '@/api/queries'
import type { Refs } from '@/api/types'
import { Highlighted } from '@/components/highlighted'
import { Keys, Shortcut } from '@/components/shortcut'
import { cn } from '@/lib/cn'
import { listCommands, onPaletteOpen } from '@/lib/commands'
import { rankPaths } from '@/lib/fuzzy'
import { repoNames, shiftPositions } from '@/lib/repo-name'
import { relativeTime } from '@/lib/time'
import { repoLink } from '@/lib/url'
import { actionMatches } from './action-matches'

const FILE_LIMIT = 50
const OTHER_LIMIT = 8

type Item = {
  key: string
  section: string
  label: string
  positions: readonly number[]
  icon: LucideIcon
  detail?: React.ReactNode
  file?: string
  run: () => void
}

export function CommandPalette({
  repo,
  resolved,
  refs,
  onRef,
}: {
  repo?: string
  resolved?: ResolvedRef
  refs?: Refs
  onRef?: (name: string) => void
}) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [sel, setSel] = useState(0)
  const deferred = useDeferredValue(query)
  const listRef = useRef<HTMLDivElement>(null)
  // only keyboard moves prefetch, so hovering results fetches nothing
  const byKeys = useRef(false)

  useEffect(
    () =>
      onPaletteOpen((q) => {
        setQuery(q)
        setSel(0)
        setOpen(true)
      }),
    [],
  )

  const rev = resolved?.rev ?? ''
  const files = useQuery({
    ...filesQuery(qc, repo ?? '', rev),
    enabled: open && !!repo && !!resolved,
  })
  const repos = useQuery({ ...reposQuery(), enabled: open })
  const names = useMemo(
    () => repoNames(repos.data?.repos.map((r) => r.name) ?? []),
    [repos.data],
  )

  const close = () => {
    setOpen(false)
    setQuery('')
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: commands are read fresh whenever the palette opens or the query changes
  const items = useMemo(() => {
    if (!open) return []
    const actionsOnly = deferred.startsWith('>')
    const q = (actionsOnly ? deferred.slice(1) : deferred).trim()
    const out: Item[] = []

    for (const c of listCommands()) {
      const positions = q ? actionMatches(q, c.label) : []
      if (!positions) continue
      out.push({
        key: `a:${c.id}`,
        section: 'Actions',
        label: c.label,
        positions,
        icon: c.icon ?? Zap,
        detail: c.shortcut && <Shortcut id={c.shortcut} />,
        run: c.run,
      })
    }
    if (actionsOnly) return out

    if (repo && files.data) {
      const ref = resolved?.isDefault ? undefined : resolved?.name
      for (const r of rankPaths(
        q,
        files.data.files,
        q ? FILE_LIMIT : OTHER_LIMIT,
      )) {
        out.push({
          key: `f:${r.path}`,
          section: 'Files',
          label: r.path,
          positions: r.positions,
          icon: File,
          file: r.path,
          run: () =>
            navigate(repoLink(repo, { kind: 'blob', ref, path: r.path })),
        })
      }
    }

    if (repo && refs && onRef) {
      const all = [
        ...refs.branches.map((b) => ({ ...b, tag: false })),
        ...refs.tags.map((t) => ({ ...t, tag: true })),
      ].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
      const byName = new Map(all.map((r) => [r.name, r]))
      for (const r of rankPaths(
        q,
        all.map((x) => x.name),
        OTHER_LIMIT,
      )) {
        const ref = byName.get(r.path)
        out.push({
          key: `r:${r.path}`,
          section: 'Branches and tags',
          label: r.path,
          positions: r.positions,
          icon: ref?.tag ? Tag : GitBranch,
          detail: ref && relativeTime(ref.updatedAt),
          run: () => onRef(r.path),
        })
      }
    }

    const list = [...(repos.data?.repos ?? [])].sort(
      (a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt),
    )
    for (const r of rankPaths(
      q,
      list.map((x) => x.name),
      OTHER_LIMIT,
    )) {
      out.push({
        key: `p:${r.path}`,
        section: 'Repositories',
        label: names.display(r.path),
        positions: shiftPositions(
          r.positions,
          r.path.length - names.display(r.path).length,
        ),
        icon: Book,
        run: () => navigate(repoLink(r.path, { kind: 'tree', path: '' })),
      })
    }
    return out
  }, [open, deferred, files.data, refs, repos.data, repo, resolved, names])

  const selected = items[sel]
  useEffect(() => {
    if (!open || !selected) return
    listRef.current
      ?.querySelector(`[data-index="${sel}"]`)
      ?.scrollIntoView({ block: 'nearest' })
    const file = selected.file
    if (!file || !repo || !rev || !byKeys.current) return
    // debounced so a held arrow key prefetches once it rests
    const t = window.setTimeout(
      () => void qc.query(blobQuery(repo, rev, file)).catch(noop),
      150,
    )
    return () => window.clearTimeout(t)
  }, [open, selected, sel, qc, repo, rev])

  const run = (item: Item | undefined) => {
    if (!item) return
    close()
    item.run()
  }

  const move = (d: number) => {
    byKeys.current = true
    setSel((s) => Math.max(0, Math.min(items.length - 1, s + d)))
  }

  const loading = !!repo && !!resolved && files.isPending
  return (
    <Dialog.Root open={open} onOpenChange={(o) => (o ? setOpen(o) : close())}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/30 dark:bg-black/50" />
        <Dialog.Content
          className={cn(
            'fixed top-[12vh] left-1/2 z-50 -translate-x-1/2',
            'flex max-h-[70vh] w-[min(720px,94vw)]',
            'flex-col overflow-hidden rounded-2xl bg-island p-2',
            'shadow-[0_0_0_1px_var(--border),0_24px_64px_-12px_rgb(0_0_0/0.45)]',
            'focus:outline-none',
          )}
          aria-describedby={undefined}
          onEscapeKeyDown={(e) => {
            if (!query) return
            e.preventDefault()
            setQuery('')
            setSel(0)
          }}
        >
          <Dialog.Title className="sr-only">Go to anything</Dialog.Title>
          <input
            // biome-ignore lint/a11y/noAutofocus: the palette exists to be typed into
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setSel(0)
            }}
            onKeyDown={(e) => {
              const ctrl = e.ctrlKey && !e.metaKey
              if (e.key === 'ArrowDown' || (ctrl && e.key === 'n')) {
                e.preventDefault()
                move(1)
              } else if (e.key === 'ArrowUp' || (ctrl && e.key === 'p')) {
                e.preventDefault()
                move(-1)
              } else if (e.key === 'Enter') {
                e.preventDefault()
                run(selected)
              }
            }}
            placeholder={
              repo
                ? 'Go to a file, branch or repository. Type > for actions'
                : 'Go to a repository. Type > for actions'
            }
            className="h-12 shrink-0 rounded-xl bg-island-muted px-4 text-lg outline-none placeholder:text-faint"
          />
          <div ref={listRef} className="min-h-0 flex-1 overflow-auto pt-1">
            {items.length === 0 && (
              <p className="px-3 py-8 text-center text-muted-foreground">
                {loading ? 'Indexing files…' : 'Nothing matches.'}
              </p>
            )}
            {items.map((it, i) => {
              const Icon = it.icon
              const head = i === 0 || items[i - 1].section !== it.section
              return (
                <div key={it.key}>
                  {head && (
                    <div className="px-3 pt-3 pb-1.5 font-medium text-faint text-sm">
                      {it.section}
                    </div>
                  )}
                  <button
                    type="button"
                    data-index={i}
                    onMouseMove={() => {
                      if (i === sel) return
                      byKeys.current = false
                      setSel(i)
                    }}
                    onClick={() => run(it)}
                    className={cn(
                      'flex h-(--row-h) w-full items-center gap-3 rounded-lg px-3 text-left',
                      i === sel && 'bg-accent',
                    )}
                  >
                    <Icon className="size-4 shrink-0 text-faint" aria-hidden />
                    <span className="min-w-0 flex-1 truncate">
                      <Highlighted text={it.label} positions={it.positions} />
                    </span>
                    {it.detail && (
                      <span className="shrink-0 text-faint text-sm num">
                        {it.detail}
                      </span>
                    )}
                    {i === sel && (
                      <CornerDownLeft
                        className="size-4 shrink-0 text-faint"
                        aria-hidden
                      />
                    )}
                  </button>
                </div>
              )
            })}
          </div>
          {files.data && (
            <div className="mt-1 flex h-9 shrink-0 items-center gap-4 rounded-lg bg-island-muted px-3 text-faint text-sm">
              <span className="num">
                {files.data.files.length.toLocaleString()}
                {files.data.truncated ? '+' : ''} files at{' '}
                {resolved?.kind === 'commit'
                  ? resolved.name.slice(0, 10)
                  : resolved?.name}
              </span>
              <span className="ml-auto flex items-center gap-1">
                <Keys keys={['↑', '↓']} />
                <span className="ml-1">move</span>
              </span>
              <span className="flex items-center gap-1">
                <Keys keys={['↵']} />
                <span className="ml-1">open</span>
              </span>
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
