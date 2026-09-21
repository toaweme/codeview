import { useQueries } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useVirtualizer } from '@tanstack/react-virtual'
import {
  ChevronRight,
  File,
  Folder,
  FolderOpen,
  GitFork,
  Link2,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { type ResolvedRef, treeQuery } from '@/api/queries'
import type { TreeEntry } from '@/api/types'
import { cn } from '@/lib/cn'
import { usePressPreload } from '@/lib/preload'
import { repoLink } from '@/lib/url'

const expandedByRepo = new Map<string, Set<string>>()

function ancestors(path: string): string[] {
  const parts = path.split('/').filter(Boolean)
  const out: string[] = []
  for (let i = 1; i < parts.length; i++) out.push(parts.slice(0, i).join('/'))
  return out
}

function sortEntries(entries: readonly TreeEntry[]): TreeEntry[] {
  return [...entries].sort((a, b) => {
    const da = a.type === 'tree' ? 0 : 1
    const db = b.type === 'tree' ? 0 : 1
    return da - db || a.name.localeCompare(b.name)
  })
}

type Node =
  | { kind: 'entry'; entry: TreeEntry; depth: number; open: boolean }
  | { kind: 'loading'; depth: number; key: string }

const ROW = 36
const INDENT = 16

export function FileTree({
  repo,
  resolved,
  current,
}: {
  repo: string
  resolved: ResolvedRef
  current: string
}) {
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(expandedByRepo.get(repo) ?? []),
  )
  const scrollRef = useRef<HTMLDivElement>(null)
  const rev = resolved.rev

  useEffect(() => {
    setExpanded((prev) => {
      const want = ancestors(current)
      if (want.every((a) => prev.has(a))) return prev
      const next = new Set(prev)
      for (const a of want) next.add(a)
      return next
    })
  }, [current])

  useEffect(() => {
    expandedByRepo.set(repo, expanded)
  }, [repo, expanded])

  const dirs = useMemo(() => ['', ...expanded], [expanded])
  const trees = useQueries({
    queries: dirs.map((d) => treeQuery(repo, rev, d)),
  })
  const byDir = new Map<string, TreeEntry[] | undefined>()
  dirs.forEach((d, i) => {
    byDir.set(d, trees[i]?.isError ? [] : trees[i]?.data?.entries)
  })
  const dataKey = trees.map((t) => t.dataUpdatedAt).join()

  // biome-ignore lint/correctness/useExhaustiveDependencies: dataKey stands in for the per-dir results
  const nodes = useMemo(() => {
    const out: Node[] = []
    const walk = (dir: string, depth: number) => {
      const entries = byDir.get(dir)
      if (!entries) {
        out.push({ kind: 'loading', depth, key: `${dir}/…` })
        return
      }
      for (const e of sortEntries(entries)) {
        const open = e.type === 'tree' && expanded.has(e.path)
        out.push({ kind: 'entry', entry: e, depth, open })
        if (open) walk(e.path, depth + 1)
      }
    }
    walk('', 0)
    return out
  }, [dataKey, expanded])

  const virt = useVirtualizer({
    count: nodes.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW,
    overscan: 20,
  })

  const currentIndex = nodes.findIndex(
    (n) => n.kind === 'entry' && n.entry.path === current,
  )
  const scrolledFor = useRef('')
  useEffect(() => {
    if (currentIndex < 0 || scrolledFor.current === current) return
    scrolledFor.current = current
    virt.scrollToIndex(currentIndex, { align: 'auto' })
  }, [currentIndex, current, virt])

  const toggle = (path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  const linkRef = resolved.isDefault ? undefined : resolved.name
  const preload = usePressPreload()

  return (
    <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto px-2 pb-3">
      <div style={{ height: virt.getTotalSize(), position: 'relative' }}>
        {virt.getVirtualItems().map((item) => {
          const n = nodes[item.index]
          const style: React.CSSProperties = {
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: ROW,
            transform: `translateY(${item.start}px)`,
            paddingLeft: 4 + n.depth * INDENT,
          }
          if (n.kind === 'loading') {
            return (
              <div key={n.key} style={style} className="flex items-center">
                <span className="ml-8 h-2.5 w-28 animate-pulse rounded bg-muted" />
              </div>
            )
          }
          const e = n.entry
          const link = repoLink(repo, {
            kind: e.type === 'tree' ? 'tree' : 'blob',
            ref: linkRef,
            path: e.path,
          })
          const active = e.path === current
          const isDir = e.type === 'tree'
          const Icon = isDir
            ? n.open
              ? FolderOpen
              : Folder
            : e.type === 'submodule'
              ? GitFork
              : e.type === 'symlink'
                ? Link2
                : File
          return (
            <div
              key={e.path}
              style={style}
              className={cn(
                'group flex items-center rounded-lg pr-2 transition-colors duration-75',
                active ? 'bg-active' : 'hover:bg-hover',
              )}
            >
              {isDir ? (
                <button
                  type="button"
                  tabIndex={-1}
                  aria-label={n.open ? 'Collapse' : 'Expand'}
                  onClick={() => toggle(e.path)}
                  className="grid size-6 shrink-0 place-items-center rounded-md text-faint hover:text-foreground"
                >
                  <ChevronRight
                    className={cn(
                      'size-4 transition-transform duration-100',
                      n.open && 'rotate-90',
                    )}
                  />
                </button>
              ) : (
                <span className="w-6 shrink-0" />
              )}
              <Link
                {...link}
                {...preload(link)}
                onClick={() => {
                  if (isDir && !n.open) toggle(e.path)
                }}
                className={cn(
                  'flex h-full min-w-0 flex-1 items-center gap-2.5 pl-1 text-base text-muted-foreground group-hover:text-foreground',
                  active && 'text-foreground',
                )}
              >
                <Icon
                  className={cn(
                    'size-4 shrink-0',
                    active ? 'text-primary' : 'text-faint',
                  )}
                  aria-hidden
                />
                <span className="truncate">{e.name}</span>
              </Link>
            </div>
          )
        })}
      </div>
    </div>
  )
}
