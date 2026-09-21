import { useQuery } from '@tanstack/react-query'
import { Link, useLocation, useNavigate } from '@tanstack/react-router'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Download, FileCodeCorner } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { apiUrl } from '@/api/client'
import { blameQuery, blobQuery, type ResolvedRef } from '@/api/queries'
import type { Blame, BlameRange } from '@/api/types'
import { Badge } from '@/components/badge'
import { LineContent } from '@/components/code/tokens'
import { ErrorState, Skeleton } from '@/features/shell/states'
import { Group, MoreMenu } from '@/features/shell/top-line'
import { getHighlight, useHighlightVersion } from '@/highlight'
import { cn } from '@/lib/cn'
import { useCommands } from '@/lib/commands'
import { formatBytes, isImagePath, shortHash } from '@/lib/format'
import { useTextWidth } from '@/lib/measure'
import { ageRatio, relativeTime } from '@/lib/time'
import {
  formatLineHash,
  parseLineHash,
  repoLink,
  type Selection,
} from '@/lib/url'
import { mergeBlame, splitLines } from './file-lines'
import { pathActions } from './path-actions'
import { PathBar, ViewToggles } from './path-bar'

const ROW = 23
const BLAME_W = 340
const AHEAD = 400

export function FileView({
  repo,
  resolved,
  path,
  blame,
}: {
  repo: string
  resolved: ResolvedRef | null
  path: string
  blame: boolean
}) {
  const rev = resolved?.rev ?? ''
  const blob = useQuery({ ...blobQuery(repo, rev, path), enabled: !!resolved })
  const blameQ = useQuery({
    ...blameQuery(repo, rev, path),
    enabled: !!resolved && blame,
  })
  const rawUrl = apiUrl('raw', { repo, ref: rev, path })

  const lineCount = useMemo(
    () => (blob.data?.content ? splitLines(blob.data.content).length : 0),
    [blob.data?.content],
  )

  useCommands(
    blob.data
      ? [
          {
            id: 'file:raw',
            label: 'Open the raw file',
            icon: FileCodeCorner,
            run: () => window.open(rawUrl, '_blank', 'noreferrer'),
          },
          {
            id: 'file:download',
            label: 'Download the file',
            icon: Download,
            run: () => {
              const a = document.createElement('a')
              a.href = rawUrl
              a.download = path.slice(path.lastIndexOf('/') + 1)
              a.click()
            },
          },
        ]
      : [],
  )

  return (
    <>
      <PathBar repo={repo} resolved={resolved} path={path}>
        {blob.data && (
          <Group>
            <span className="hidden items-center gap-1.5 xl:flex">
              {!blob.data.binary && (
                <Badge>{lineCount.toLocaleString()} lines</Badge>
              )}
              <Badge>{formatBytes(blob.data.size)}</Badge>
            </span>
          </Group>
        )}
        <ViewToggles
          repo={repo}
          resolved={resolved}
          path={path}
          active={blame ? 'blame' : 'code'}
          file
        />
        <MoreMenu
          items={pathActions(repo, resolved, {
            kind: blame ? 'blame' : 'blob',
            path,
          })}
        />
      </PathBar>
      {!resolved || blob.isPending ? (
        <Skeleton lines={24} />
      ) : blob.isError ? (
        <ErrorState error={blob.error} />
      ) : blob.data.binary || blob.data.content === undefined ? (
        <BinaryFile path={path} rawUrl={rawUrl} size={blob.data.size} />
      ) : (
        <CodeLines
          key={`${repo}:${rev}:${path}`}
          docKey={`blob:${repo}:${rev}:${path}`}
          path={path}
          text={blob.data.content}
          truncated={blob.data.truncated}
          blame={blame ? blameQ.data : undefined}
          blameLoading={blame && blameQ.isPending}
          repo={repo}
        />
      )}
    </>
  )
}

function BinaryFile({
  path,
  rawUrl,
  size,
}: {
  path: string
  rawUrl: string
  size: number
}) {
  if (isImagePath(path)) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-8">
        <img
          src={rawUrl}
          alt={path}
          className="max-h-full max-w-full bg-[repeating-conic-gradient(var(--muted)_0%_25%,transparent_0%_50%)] bg-[length:16px_16px]"
        />
      </div>
    )
  }
  return (
    <div className="px-6 py-16 text-center text-muted-foreground">
      Binary file, {formatBytes(size)}.{' '}
      <a href={rawUrl} download className="text-primary hover:underline">
        Download
      </a>
    </div>
  )
}

type BlameIndex = {
  at: Int32Array
  ranges: BlameRange[]
  oldest: number
  newest: number
}

function indexBlame(b: Blame, lines: number): BlameIndex {
  const ranges = mergeBlame(b.ranges)
  const at = new Int32Array(lines).fill(-1)
  let oldest = Number.POSITIVE_INFINITY
  let newest = 0
  ranges.forEach((r, i) => {
    for (let l = r.start; l <= r.end && l <= lines; l++) at[l - 1] = i
    const t = Date.parse(r.commit.author.date)
    if (t < oldest) oldest = t
    if (t > newest) newest = t
  })
  return { at, ranges, oldest, newest }
}

function CodeLines({
  docKey,
  path,
  text,
  truncated,
  blame,
  blameLoading,
  repo,
}: {
  docKey: string
  path: string
  text: string
  truncated: boolean
  blame?: Blame
  blameLoading: boolean
  repo: string
}) {
  const navigate = useNavigate()
  const hash = useLocation({ select: (l) => l.hash })
  const sel = parseLineHash(hash)
  const scrollRef = useRef<HTMLDivElement>(null)
  const codeRef = useRef<HTMLDivElement>(null)
  const lines = useMemo(() => splitLines(text), [text])
  const hl = useMemo(
    () => getHighlight(docKey, path, text),
    [docKey, path, text],
  )
  useHighlightVersion(hl)
  const textWidth = useTextWidth(lines, codeRef)
  const blameIdx = useMemo(
    () => (blame ? indexBlame(blame, lines.length) : null),
    [blame, lines.length],
  )
  const [anchor, setAnchor] = useState<number | null>(sel?.start ?? null)

  const virt = useVirtualizer({
    count: lines.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW,
    overscan: 24,
  })
  const items = virt.getVirtualItems()
  const last = items.length ? items[items.length - 1].index : 0

  useEffect(() => {
    hl.want(last + AHEAD)
  }, [hl, last])

  // scroll only when the selection comes from outside, not from a click here
  const ownHash = useRef<string | null>(null)
  useEffect(() => {
    if (!sel) return
    if (ownHash.current === hash) return
    ownHash.current = hash
    virt.scrollToIndex(Math.max(0, sel.start - 1), { align: 'center' })
  }, [hash, sel, virt])

  const setSelection = (next: Selection | null) => {
    const h = formatLineHash(next)
    ownHash.current = h ? `${h}` : ''
    navigate({
      to: '.',
      hash: h,
      replace: true,
      resetScroll: false,
    })
  }

  const clickLine = (n: number, shift: boolean) => {
    if (shift && anchor !== null) {
      setSelection({ start: Math.min(anchor, n), end: Math.max(anchor, n) })
      return
    }
    setAnchor(n)
    if (sel && sel.start === n && sel.end === n) setSelection(null)
    else setSelection({ start: n, end: n })
  }

  const digits = String(lines.length).length
  const numW = `calc(${digits}ch + 44px)`
  const blameW = blameIdx || blameLoading ? BLAME_W : 0

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {truncated && (
        <div className="shrink-0 px-6 pb-2 text-faint text-sm">
          This file is large, so only its beginning is shown.
        </div>
      )}
      <div ref={scrollRef} className="code min-h-0 flex-1 overflow-auto">
        {lines.length === 1 && lines[0] === '' ? (
          <div className="px-6 py-10 font-sans text-muted-foreground">
            Empty file.
          </div>
        ) : (
          <div
            ref={codeRef}
            className="relative"
            style={{
              height: virt.getTotalSize() + 16,
              minWidth: '100%',
              width: `calc(${blameW}px + ${numW} + ${textWidth}px + 64px)`,
            }}
          >
            {items.map((item) => {
              const i = item.index
              const n = i + 1
              const selected = !!sel && n >= sel.start && n <= sel.end
              const r = blameIdx ? blameIdx.at[i] : -1
              const rangeStart =
                blameIdx && r >= 0 && (i === 0 || blameIdx.at[i - 1] !== r)
              return (
                <div
                  key={i}
                  className={cn(
                    'absolute top-0 left-0 flex w-full',
                    selected && 'bg-line-sel',
                  )}
                  style={{
                    height: ROW,
                    transform: `translateY(${item.start + 8}px)`,
                  }}
                >
                  {blameW > 0 && (
                    <BlameCell
                      repo={repo}
                      idx={blameIdx}
                      range={r}
                      first={!!rangeStart}
                      divider={!!rangeStart && i > 0}
                    />
                  )}
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={(e) => clickLine(n, e.shiftKey)}
                    className={cn(
                      'sticky z-[1] shrink-0',
                      'pr-4 pl-6',
                      'select-none bg-background text-right font-sans text-sm text-faint/80 num',
                      'hover:text-foreground',
                      selected && 'bg-line-sel text-primary',
                    )}
                    style={{ width: numW, left: blameW }}
                  >
                    {n}
                  </button>
                  <div className="whitespace-pre pr-10 pl-3">
                    <LineContent text={lines[i]} tokens={hl.lines[i]} />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function BlameCell({
  repo,
  idx,
  range,
  first,
  divider,
}: {
  repo: string
  idx: BlameIndex | null
  range: number
  first: boolean
  divider: boolean
}) {
  const r = idx && range >= 0 ? idx.ranges[range] : null
  const age =
    r && idx ? ageRatio(r.commit.author.date, idx.oldest, idx.newest) : 0
  return (
    <div
      className={cn(
        'sticky z-[2] flex shrink-0 items-center',
        'left-0 gap-3 pr-4 pl-6',
        'bg-background font-sans text-sm',
        divider && 'shadow-[inset_0_1px_0_var(--border)]',
      )}
      style={{ width: BLAME_W }}
    >
      {r && first ? (
        <>
          <Link
            {...repoLink(repo, { kind: 'commit', hash: r.commit.hash })}
            title={`${r.commit.subject}\n${r.commit.author.name}, ${shortHash(r.commit.hash)}`}
            className={cn(
              'flex-1',
              'min-w-0',
              'truncate text-muted-foreground',
              'transition-colors duration-100 hover:text-foreground',
            )}
          >
            {r.commit.subject}
          </Link>
          <span className="max-w-24 shrink-0 truncate text-faint">
            {r.commit.author.name}
          </span>
          <span className="w-16 shrink-0 truncate text-right text-faint text-xs num">
            {relativeTime(r.commit.author.date)}
          </span>
        </>
      ) : !idx ? (
        <span className="h-2 w-40 animate-pulse rounded bg-muted" />
      ) : (
        <span className="flex-1" />
      )}
      <span
        className="h-full w-0.5 shrink-0 rounded-full"
        style={{
          backgroundColor: r
            ? `color-mix(in oklab, var(--primary) ${Math.round(10 + age * 70)}%, transparent)`
            : 'transparent',
        }}
      />
    </div>
  )
}
