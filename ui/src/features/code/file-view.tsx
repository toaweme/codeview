import { useQuery } from '@tanstack/react-query'
import { Link, useLocation, useNavigate } from '@tanstack/react-router'
import { useVirtualizer } from '@tanstack/react-virtual'
import { BookOpen, Code2, Download, FileCodeCorner } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { apiUrl } from '@/api/client'
import {
  blameQuery,
  blobQuery,
  isMarkdownPath,
  type ResolvedRef,
  renderQuery,
} from '@/api/queries'
import type { Blame, BlameRange } from '@/api/types'
import { Avatar } from '@/components/avatar'
import { Badge } from '@/components/badge'
import { LineContent } from '@/components/code/tokens'
import { Markdown } from '@/components/markdown'
import { Tooltip } from '@/components/tooltip'
import { ErrorState, Skeleton } from '@/features/shell/states'
import { Group, MoreMenu, ViewSwitch } from '@/features/shell/top-line'
import { getHighlight, useHighlightVersion } from '@/highlight'
import { cn } from '@/lib/cn'
import { useCommands } from '@/lib/commands'
import { formatBytes, isImagePath, shortHash } from '@/lib/format'
import { useTextWidth } from '@/lib/measure'
import { ageRatio, ageStep, relativeTime } from '@/lib/time'
import {
  formatLineHash,
  parseLineHash,
  repoLink,
  type Selection,
} from '@/lib/url'
import { useMedia } from '@/lib/use-media'
import { authorLabel, BlameLegend } from './blame-legend'
import { mergeBlame, splitLines } from './file-lines'
import { pathActions } from './path-actions'
import { PathBar, ViewToggles } from './path-bar'

const ROW = 23
const BLAME_W = 300
// a phone keeps the sticky blame column narrow so code stays in view
const BLAME_W_NARROW = 150
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
  const navigate = useNavigate()
  const hash = useLocation({ select: (l) => l.hash })

  const md = isMarkdownPath(path) && !blame
  const [mdMode, setMdMode] = useState<'rendered' | 'source'>(() =>
    parseLineHash(hash) ? 'source' : 'rendered',
  )
  const showRendered = md && mdMode === 'rendered'
  const rendered = useQuery({
    ...renderQuery(repo, rev, path),
    enabled: !!resolved && showRendered,
  })
  const switchMd = (mode: 'rendered' | 'source') => {
    setMdMode(mode)
    if (mode === 'rendered' && parseLineHash(hash))
      navigate({ to: '.', hash: '', replace: true, resetScroll: false })
  }

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
        {md && (
          <ViewSwitch
            label="Markdown"
            items={[
              {
                key: 'rendered',
                label: 'Rendered',
                icon: BookOpen,
                active: mdMode === 'rendered',
                onClick: () => switchMd('rendered'),
              },
              {
                key: 'source',
                label: 'Source',
                icon: Code2,
                active: mdMode === 'source',
                onClick: () => switchMd('source'),
              },
            ]}
          />
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
      ) : showRendered ? (
        <div className="min-h-0 flex-1 overflow-auto">
          <div className="mx-auto w-full max-w-[860px] px-3 pt-4 pb-16 sm:px-6 sm:pt-6">
            {rendered.isPending ? (
              <Skeleton lines={16} className="px-0" />
            ) : (
              <Markdown
                source={blob.data.content}
                html={rendered.data?.html}
                repo={repo}
                rev={rev}
                linkRef={resolved.isDefault ? undefined : resolved.name}
              />
            )}
          </div>
        </div>
      ) : (
        <>
          {blame && <BlameLegend blame={blameQ.data} />}
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
        </>
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
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-4 sm:p-8">
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

  const roomy = useMedia('(min-width: 640px)')
  const digits = String(lines.length).length
  const numW = `calc(${digits}ch + ${roomy ? 44 : 28}px)`
  const blameW =
    blameIdx || blameLoading ? (roomy ? BLAME_W : BLAME_W_NARROW) : 0

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {truncated && (
        <div className="shrink-0 px-3 pb-2 text-faint text-sm sm:px-6">
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
              height: virt.getTotalSize() + 24,
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
                    rangeStart &&
                      i > 0 &&
                      "before:absolute before:inset-x-0 before:top-0 before:z-[3] before:h-px before:bg-border before:content-['']",
                  )}
                  style={{
                    height: ROW,
                    transform: `translateY(${item.start + 12}px)`,
                  }}
                >
                  {blameW > 0 && (
                    <BlameCell
                      repo={repo}
                      idx={blameIdx}
                      range={r}
                      first={!!rangeStart}
                      width={blameW}
                    />
                  )}
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={(e) => clickLine(n, e.shiftKey)}
                    className={cn(
                      'sticky z-[1] shrink-0',
                      'px-3 sm:pr-4 sm:pl-6',
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
  width,
}: {
  repo: string
  idx: BlameIndex | null
  range: number
  first: boolean
  width: number
}) {
  const r = idx && range >= 0 ? idx.ranges[range] : null
  const step =
    r && idx
      ? ageStep(ageRatio(r.commit.author.date, idx.oldest, idx.newest))
      : -1
  return (
    <div
      className={cn(
        'sticky z-[2] flex shrink-0 items-center',
        'left-0 gap-2 pr-2 sm:gap-3 sm:pr-4',
        'bg-background font-sans text-sm',
      )}
      style={{ width }}
    >
      <span
        className="mr-2 w-1 shrink-0 self-stretch"
        style={{
          backgroundColor: step >= 0 ? `var(--age-${step + 1})` : 'transparent',
        }}
      />
      {r && first ? (
        <>
          <span className="w-24 shrink-0 whitespace-nowrap text-faint text-xs num max-sm:hidden">
            {relativeTime(r.commit.author.date)}
          </span>
          <Tooltip label={authorLabel(r.commit.author)}>
            <Avatar
              name={r.commit.author.name}
              className="size-5 text-[10px]"
            />
          </Tooltip>
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
        </>
      ) : !idx ? (
        <span className="h-2 w-full max-w-40 animate-pulse rounded bg-muted" />
      ) : (
        <span className="flex-1" />
      )}
    </div>
  )
}
