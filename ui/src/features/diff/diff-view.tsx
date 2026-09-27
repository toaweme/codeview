import { useQueries } from '@tanstack/react-query'
import { useVirtualizer } from '@tanstack/react-virtual'
import {
  ChevronsDownUp,
  ChevronsUpDown,
  Columns2,
  Eye,
  Rows3,
} from 'lucide-react'
import {
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'
import { blobQuery } from '@/api/queries'
import type { FileDiff } from '@/api/types'
import { Badge, Counts } from '@/components/badge'
import { SidebarSlot } from '@/features/shell/sidebar-slot'
import {
  type Crumb,
  Group,
  type MenuItem,
  MoreMenu,
  TopLine,
  ViewSwitch,
} from '@/features/shell/top-line'
import { getHighlight, type Highlight } from '@/highlight'
import { useCommands } from '@/lib/commands'
import {
  buildRows,
  type DiffMode,
  type Row,
  sideDocument,
} from '@/lib/diff-model'
import { usePersistedState } from '@/lib/use-persisted-state'
import { DiffFileList } from './diff-file-list'
import { DiffRow, FileHeader, type RowContext } from './diff-rows'
import { useViewed } from './viewed'

const LARGE = 1500

const ESTIMATE: Record<Row['kind'], number> = {
  file: 48,
  hunk: 32,
  line: 23,
  split: 23,
  ctx: 23,
  expand: 36,
  note: 44,
}

function rowKey(r: Row): string {
  switch (r.kind) {
    case 'file':
      return `f${r.file}`
    case 'hunk':
      return `h${r.file}:${r.hunk}`
    case 'line':
      return `l${r.file}:${r.line.old}:${r.line.new}`
    case 'split':
      return `s${r.file}:${r.left?.old}:${r.left?.new}:${r.right?.old}:${r.right?.new}`
    case 'ctx':
      return `c${r.file}:${r.new}`
    case 'expand':
      return `e${r.gap.key}`
    case 'note':
      return `n${r.file}:${r.text.length}`
  }
}

type SideDocs = {
  old: ReturnType<typeof sideDocument>
  new: ReturnType<typeof sideDocument>
}
const docsCache = new WeakMap<FileDiff, SideDocs>()

function docsFor(f: FileDiff): SideDocs {
  let d = docsCache.get(f)
  if (!d) {
    d = { old: sideDocument(f, 'old'), new: sideDocument(f, 'new') }
    docsCache.set(f, d)
  }
  return d
}

function useSubscribeAll(list: readonly Highlight[]) {
  const [, bump] = useReducer((n: number) => n + 1, 0)
  const key = list.map((h) => h.id).join()
  // biome-ignore lint/correctness/useExhaustiveDependencies: key identifies the list
  useEffect(() => {
    const offs = list.map((h) => h.subscribe(bump))
    return () => {
      for (const off of offs) off()
    }
  }, [key])
}

export function DiffView({
  repo,
  files,
  viewKey,
  newRev,
  oldRev,
  header,
  banner,
  crumbs,
  actions = [],
}: {
  repo: string
  files: FileDiff[]
  viewKey: string
  newRev: string
  oldRev?: string
  header?: React.ReactNode
  // banner stays pinned, header scrolls with the diff
  banner?: React.ReactNode
  crumbs: Crumb[]
  actions?: MenuItem[]
}) {
  const [mode, setMode] = usePersistedState<DiffMode>('diff:mode', 'unified')
  const slot = useContext(SidebarSlot)
  const { viewed, toggleViewed } = useViewed(repo, viewKey)
  const [overrides, setOverrides] = useState<Map<number, boolean>>(new Map())
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [fetchFiles, setFetchFiles] = useState<Set<number>>(new Set())
  const scrollRef = useRef<HTMLDivElement>(null)
  const headerRef = useRef<HTMLDivElement>(null)
  const [margin, setMargin] = useState(0)

  const collapsed = useMemo(() => {
    const s = new Set<number>()
    files.forEach((f, i) => {
      const byDefault = viewed.has(f.path) || f.additions + f.deletions > LARGE
      const o = overrides.get(i)
      if (o === undefined ? byDefault : o) s.add(i)
    })
    return s
  }, [files, viewed, overrides])

  const fetchList = useMemo(() => [...fetchFiles], [fetchFiles])
  const blobs = useQueries({
    queries: fetchList.map((fi) => blobQuery(repo, newRev, files[fi].path)),
  })
  const blobKey = blobs.map((b) => b.dataUpdatedAt).join()
  // biome-ignore lint/correctness/useExhaustiveDependencies: blobKey stands in for the query results
  const fullText = useMemo(() => {
    const m = new Map<number, string[]>()
    fetchList.forEach((fi, i) => {
      const c = blobs[i]?.data?.content
      if (c !== undefined) {
        const lines = c.split('\n')
        if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop()
        m.set(fi, lines)
      }
    })
    return m
  }, [blobKey, fetchList])

  const model = useMemo(
    () => buildRows(files, { mode, collapsed, expanded, fullText }),
    [files, mode, collapsed, expanded, fullText],
  )
  const { rows, fileStarts, fileOf } = model

  useLayoutEffect(() => {
    const el = headerRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setMargin(el.offsetHeight))
    ro.observe(el)
    setMargin(el.offsetHeight)
    return () => ro.disconnect()
  }, [])

  const virt = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (i) => ESTIMATE[rows[i].kind],
    getItemKey: (i) => rowKey(rows[i]),
    overscan: 16,
    scrollMargin: margin,
  })
  const items = virt.getVirtualItems()
  const scrollTop = virt.scrollOffset ?? 0

  const topItem = items.find((it) => it.end > scrollTop + 1)
  const currentFile = topItem ? fileOf[topItem.index] : 0
  const currentHeaderStart =
    virt.measurementsCache[fileStarts[currentFile]]?.start ?? 0
  const showSticky =
    topItem !== undefined &&
    scrollTop > margin &&
    currentHeaderStart < scrollTop

  const visibleFiles = useMemo(() => {
    const s = new Set<number>()
    for (const it of items) s.add(fileOf[it.index])
    return [...s].sort((a, b) => a - b)
  }, [items, fileOf])

  const highlights = useMemo(() => {
    const out = new Map<string, Highlight>()
    for (const fi of visibleFiles) {
      if (collapsed.has(fi)) continue
      const f = files[fi]
      const d = docsFor(f)
      const base = `diff:${repo}:${viewKey}:${fi}`
      const o = getHighlight(`${base}:old`, f.old_path || f.path, d.old.text)
      const n = getHighlight(`${base}:new`, f.path, d.new.text)
      o.want(1e9)
      n.want(1e9)
      out.set(`${fi}:old`, o)
      out.set(`${fi}:new`, n)
      const full = fullText.get(fi)
      if (full) {
        const h = getHighlight(
          `full:${repo}:${newRev}:${f.path}`,
          f.path,
          full.join('\n'),
        )
        h.want(1e9)
        out.set(`${fi}:full`, h)
      }
    }
    return out
  }, [visibleFiles, collapsed, files, repo, viewKey, newRev, fullText])
  useSubscribeAll(useMemo(() => [...highlights.values()], [highlights]))

  const scrollToFile = useCallback(
    (fi: number) => {
      const start = virt.measurementsCache[fileStarts[fi]]?.start
      if (start !== undefined) virt.scrollToOffset(start)
      else virt.scrollToIndex(fileStarts[fi], { align: 'start' })
    },
    [virt, fileStarts],
  )

  const setOpen = (fi: number, open: boolean) =>
    setOverrides((prev) => new Map(prev).set(fi, !open))

  const markViewed = (fi: number) => {
    const f = files[fi]
    const now = !viewed.has(f.path)
    toggleViewed(f.path)
    setOverrides((prev) => {
      const next = new Map(prev)
      next.delete(fi)
      return next
    })
    if (now && fi + 1 < files.length) {
      // let the collapse render before measuring
      requestAnimationFrame(() => scrollToFile(fi + 1))
    } else if (now) {
      requestAnimationFrame(() => scrollToFile(fi))
    }
  }

  const expandGap = (fi: number, key: string) => {
    setFetchFiles((prev) => (prev.has(fi) ? prev : new Set(prev).add(fi)))
    setExpanded((prev) => new Set(prev).add(key))
  }

  const toggleMode = () =>
    setMode((m) => (m === 'unified' ? 'split' : 'unified'))

  useCommands([
    {
      id: 'diff:mode',
      label: mode === 'unified' ? 'Show split diff' : 'Show unified diff',
      icon: mode === 'unified' ? Columns2 : Rows3,
      run: toggleMode,
    },
    {
      id: 'diff:viewed',
      label: 'Mark the current file viewed',
      icon: Eye,
      run: () => markViewed(currentFile),
    },
  ])

  const totals = useMemo(
    () =>
      files.reduce(
        (acc, f) => {
          acc.add += f.additions
          acc.del += f.deletions
          return acc
        },
        { add: 0, del: 0 },
      ),
    [files],
  )

  const ctx: RowContext = {
    repo,
    newRev,
    oldRev,
    files,
    mode,
    collapsed,
    viewed,
    highlights,
    docsFor,
    onToggleOpen: (fi) => setOpen(fi, collapsed.has(fi)),
    onToggleViewed: markViewed,
    onExpand: expandGap,
    loadingFull: (fi) => fetchFiles.has(fi) && !fullText.has(fi),
  }

  const setAllOpen = (open: boolean) =>
    setOverrides(new Map(files.map((_, i) => [i, !open])))
  const diffActions: MenuItem[] =
    files.length > 0
      ? [
          {
            key: 'expand-all',
            label: 'Expand all files',
            icon: ChevronsUpDown,
            run: () => setAllOpen(true),
          },
          {
            key: 'collapse-all',
            label: 'Collapse all files',
            icon: ChevronsDownUp,
            run: () => setAllOpen(false),
          },
        ]
      : []

  const viewedCount = files.filter((f) => viewed.has(f.path)).length

  return (
    <>
      {slot &&
        files.length > 0 &&
        createPortal(
          <DiffFileList
            files={files}
            current={currentFile}
            viewed={viewed}
            onSelect={scrollToFile}
            onToggleViewed={markViewed}
          />,
          slot,
        )}
      <TopLine crumbs={crumbs}>
        <Group>
          <span className="hidden items-center gap-1.5 xl:flex">
            <Badge>
              {files.length} {files.length === 1 ? 'file' : 'files'}
            </Badge>
            <Counts add={totals.add} del={totals.del} />
            {viewedCount > 0 && (
              <Badge tone="primary">
                {viewedCount} of {files.length} viewed
              </Badge>
            )}
          </span>
        </Group>
        <LayoutSwitch mode={mode} setMode={setMode} />
        <MoreMenu items={[...actions, ...diffActions]} />
      </TopLine>
      {banner}
      <div className="relative flex min-h-0 flex-1 flex-col">
        <div className="relative min-h-0 flex-1">
          <div ref={scrollRef} className="absolute inset-0 overflow-auto">
            <div ref={headerRef}>{header}</div>
            <div
              className="code relative"
              style={{ height: virt.getTotalSize() + 48 }}
            >
              {items.map((it) => (
                <div
                  key={it.key}
                  data-index={it.index}
                  ref={virt.measureElement}
                  className="absolute top-0 right-3 left-3"
                  style={{ transform: `translateY(${it.start - margin}px)` }}
                >
                  <DiffRow row={rows[it.index]} ctx={ctx} />
                </div>
              ))}
            </div>
            {files.length === 0 && (
              <div className="px-6 py-16 text-center font-sans text-muted-foreground">
                No file changes.
              </div>
            )}
          </div>
          {showSticky && (
            <div className="pointer-events-auto absolute top-0 right-6 left-3 z-10">
              <FileHeader file={currentFile} ctx={ctx} sticky />
            </div>
          )}
        </div>
      </div>
    </>
  )
}

function LayoutSwitch({
  mode,
  setMode,
}: {
  mode: DiffMode
  setMode: (m: DiffMode) => void
}) {
  return (
    <ViewSwitch
      label="Diff layout"
      items={[
        {
          key: 'unified',
          label: 'Unified',
          icon: Rows3,
          active: mode === 'unified',
          onClick: () => setMode('unified'),
        },
        {
          key: 'split',
          label: 'Split',
          icon: Columns2,
          active: mode === 'split',
          onClick: () => setMode('split'),
        },
      ]}
    />
  )
}

export function DiffTopLine({
  crumbs,
  actions,
}: {
  crumbs: Crumb[]
  actions: MenuItem[]
}) {
  const [mode, setMode] = usePersistedState<DiffMode>('diff:mode', 'unified')
  return (
    <TopLine crumbs={crumbs}>
      <LayoutSwitch mode={mode} setMode={setMode} />
      <MoreMenu items={actions} />
    </TopLine>
  )
}
