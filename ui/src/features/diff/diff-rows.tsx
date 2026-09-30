import { Link } from '@tanstack/react-router'
import {
  Check,
  ChevronRight,
  ChevronsUpDown,
  FileCodeCorner,
} from 'lucide-react'
import type { DiffLine, FileDiff } from '@/api/types'
import { Counts } from '@/components/badge'
import { LineContent } from '@/components/code/tokens'
import { CopyButton } from '@/components/copy-button'
import { Tooltip } from '@/components/tooltip'
import type { Highlight, Tok } from '@/highlight'
import { cn } from '@/lib/cn'
import type { DiffMode, Row, sideDocument } from '@/lib/diff-model'
import { repoLink } from '@/lib/url'
import { type WordDiff, wordDiff } from '@/lib/word-diff'
import { StatusBadge } from './status'

export type RowContext = {
  repo: string
  newRev: string
  oldRev?: string
  files: FileDiff[]
  mode: DiffMode
  collapsed: ReadonlySet<number>
  viewed: ReadonlySet<string>
  highlights: Map<string, Highlight>
  docsFor: (f: FileDiff) => {
    old: ReturnType<typeof sideDocument>
    new: ReturnType<typeof sideDocument>
  }
  onToggleOpen: (file: number) => void
  onToggleViewed: (file: number) => void
  onExpand: (file: number, gapKey: string) => void
  loadingFull: (file: number) => boolean
}

const words = new WeakMap<DiffLine, WordDiff | null>()

function marksFor(line: DiffLine, pair?: DiffLine) {
  if (!pair) return undefined
  const del = line.type === 'del' ? line : pair
  const add = line.type === 'del' ? pair : line
  let w = words.get(del)
  if (w === undefined) {
    w = wordDiff(del.text, add.text)
    words.set(del, w)
  }
  if (!w) return undefined
  return line.type === 'del' ? w.old : w.new
}

function tokensFor(
  ctx: RowContext,
  file: number,
  line: DiffLine,
): Tok[] | undefined {
  const f = ctx.files[file]
  const docs = ctx.docsFor(f)
  if (line.type === 'del') {
    const i = line.old === null ? undefined : docs.old.index.get(line.old)
    return i === undefined
      ? undefined
      : ctx.highlights.get(`${file}:old`)?.lines[i]
  }
  const i = line.new === null ? undefined : docs.new.index.get(line.new)
  return i === undefined
    ? undefined
    : ctx.highlights.get(`${file}:new`)?.lines[i]
}

const NUM =
  'w-10 shrink-0 select-none pr-2 sm:w-12 sm:pr-2.5 text-right font-sans text-xs text-faint/80 num'

const BG = {
  add: 'bg-add-bg',
  del: 'bg-del-bg',
  context: '',
} as const

const GUTTER = {
  add: 'bg-add-gutter',
  del: 'bg-del-gutter',
  context: '',
} as const

const SIGN = { add: '+', del: '−', context: '' } as const

export function DiffRow({ row, ctx }: { row: Row; ctx: RowContext }) {
  switch (row.kind) {
    case 'file':
      return <FileHeader file={row.file} ctx={ctx} />
    case 'hunk': {
      const gap = row.gap
      const f = ctx.files[row.file]
      const h = f.hunks[row.hunk]
      const canExpand = gap && f.status !== 'deleted' && f.status !== 'added'
      const count = gap?.end !== null && gap ? gap.end - gap.start + 1 : 0
      return (
        <div
          className={cn(
            'flex items-center rounded-md',
            'mt-1 mb-1 min-h-8',
            'bg-hunk-bg font-sans text-hunk-fg text-sm',
          )}
        >
          <div className="flex w-20 shrink-0 justify-center sm:w-24">
            {canExpand && (
              <Tooltip
                label={`Expand ${count} unchanged ${count === 1 ? 'line' : 'lines'}`}
              >
                <button
                  type="button"
                  disabled={ctx.loadingFull(row.file)}
                  onClick={() => gap && ctx.onExpand(row.file, gap.key)}
                  className={cn(
                    'grid place-items-center rounded-md',
                    'h-8 w-full',
                    'transition-colors duration-100',
                    'hover:bg-active hover:text-foreground',
                    'disabled:animate-pulse',
                  )}
                  aria-label="Expand hidden lines"
                >
                  <ChevronsUpDown className="size-4" />
                </button>
              </Tooltip>
            )}
          </div>
          <span className="truncate py-1 pl-2">
            <span className="num">
              @@ -{h.old_start},{h.old_lines} +{h.new_start},{h.new_lines} @@
            </span>
            {row.header && (
              <span className="ml-3 text-muted-foreground">
                {row.header.replace(/^@@[^@]*@@\s*/, '')}
              </span>
            )}
          </span>
        </div>
      )
    }
    case 'line':
      return (
        <UnifiedLine
          ctx={ctx}
          file={row.file}
          line={row.line}
          pair={row.pair}
        />
      )
    case 'split':
      return (
        <SplitLine
          ctx={ctx}
          file={row.file}
          left={row.left}
          right={row.right}
        />
      )
    case 'ctx': {
      const tokens = ctx.highlights.get(`${row.file}:full`)?.lines[row.new - 1]
      if (ctx.mode === 'split') {
        return (
          <div className="flex">
            <div className="flex w-1/2 min-w-0 border-border border-r">
              <span className={NUM}>{row.old}</span>
              <Code text={row.text} tokens={tokens} />
            </div>
            <div className="flex w-1/2 min-w-0">
              <span className={NUM}>{row.new}</span>
              <Code text={row.text} tokens={tokens} />
            </div>
          </div>
        )
      }
      return (
        <div className="flex">
          <span className={NUM}>{row.old}</span>
          <span className={NUM}>{row.new}</span>
          <span className="w-5 shrink-0" />
          <Code text={row.text} tokens={tokens} />
        </div>
      )
    }
    case 'expand':
      if (row.gap.end === null) return <div className="h-9" aria-hidden />
      return (
        <div className="flex h-9 items-center font-sans text-hunk-fg text-sm">
          <button
            type="button"
            disabled={ctx.loadingFull(row.file)}
            onClick={() => ctx.onExpand(row.file, row.gap.key)}
            className={cn(
              'flex items-center',
              'h-full gap-2 px-4',
              'whitespace-nowrap',
              'transition-colors duration-100 hover:text-foreground disabled:animate-pulse',
            )}
          >
            <ChevronsUpDown className="size-4" aria-hidden />
            Show the rest of the file
          </button>
        </div>
      )
    case 'note':
      return (
        <div className="px-4 py-3 font-sans text-muted-foreground text-sm">
          {row.text}
        </div>
      )
  }
}

function Code({
  text,
  tokens,
  marks,
  markClass,
  className,
}: {
  text: string
  tokens?: Tok[]
  marks?: ReturnType<typeof marksFor>
  markClass?: string
  className?: string
}) {
  return (
    <div
      className={cn(
        'min-w-0 flex-1 whitespace-pre-wrap break-words pr-4 [overflow-wrap:anywhere]',
        className,
      )}
    >
      <LineContent
        text={text}
        tokens={tokens}
        marks={marks}
        markClass={markClass}
      />
      {text === '' && '​'}
    </div>
  )
}

function UnifiedLine({
  ctx,
  file,
  line,
  pair,
}: {
  ctx: RowContext
  file: number
  line: DiffLine
  pair?: DiffLine
}) {
  const t = line.type
  return (
    <div className={cn('flex', BG[t])}>
      <span className={cn(NUM, GUTTER[t])}>{line.old ?? ''}</span>
      <span className={cn(NUM, GUTTER[t])}>{line.new ?? ''}</span>
      <span
        className={cn(
          'w-5 shrink-0 select-none text-center',
          t === 'add' ? 'text-add' : 'text-del',
        )}
      >
        {SIGN[t]}
      </span>
      <Code
        text={line.text}
        tokens={tokensFor(ctx, file, line)}
        marks={marksFor(line, pair)}
        markClass={t === 'add' ? 'word-add' : 'word-del'}
      />
    </div>
  )
}

function SplitSide({
  ctx,
  file,
  line,
  pair,
  side,
}: {
  ctx: RowContext
  file: number
  line?: DiffLine
  pair?: DiffLine
  side: 'old' | 'new'
}) {
  if (!line) {
    return (
      <div
        className={cn(
          'flex w-1/2 min-w-0 bg-muted/25',
          side === 'old' && 'border-border border-r',
        )}
      />
    )
  }
  const t = line.type
  const n = side === 'old' ? line.old : line.new
  return (
    <div
      className={cn(
        'flex w-1/2 min-w-0',
        BG[t],
        side === 'old' && 'border-border border-r',
      )}
    >
      <span className={cn(NUM, GUTTER[t])}>{n ?? ''}</span>
      <span
        className={cn(
          'w-4 shrink-0 select-none text-center',
          t === 'add' ? 'text-add' : 'text-del',
        )}
      >
        {SIGN[t]}
      </span>
      <Code
        text={line.text}
        tokens={tokensFor(ctx, file, line)}
        marks={marksFor(line, pair)}
        markClass={t === 'add' ? 'word-add' : 'word-del'}
      />
    </div>
  )
}

function SplitLine({
  ctx,
  file,
  left,
  right,
}: {
  ctx: RowContext
  file: number
  left?: DiffLine
  right?: DiffLine
}) {
  const paired = left && right && left.type === 'del' && right.type === 'add'
  return (
    <div className="flex">
      <SplitSide
        ctx={ctx}
        file={file}
        line={left}
        pair={paired ? right : undefined}
        side="old"
      />
      <SplitSide
        ctx={ctx}
        file={file}
        line={right}
        pair={paired ? left : undefined}
        side="new"
      />
    </div>
  )
}

export function FileHeader({
  file,
  ctx,
  sticky,
}: {
  file: number
  ctx: RowContext
  sticky?: boolean
}) {
  const f = ctx.files[file]
  const open = !ctx.collapsed.has(file)
  const viewed = ctx.viewed.has(f.path)
  const renamed = f.old_path && f.old_path !== f.path
  return (
    <div className={cn('font-sans', !sticky && file > 0 && 'pt-6')}>
      <div
        className={cn(
          'group flex items-center rounded-lg',
          'h-11 gap-2 pr-1.5 pl-1 sm:gap-2.5 sm:pr-2 sm:pl-1.5',
          'bg-island-muted text-base',
        )}
      >
        <button
          type="button"
          onClick={() => ctx.onToggleOpen(file)}
          aria-label={open ? 'Collapse file' : 'Expand file'}
          className={cn(
            'grid shrink-0 place-items-center rounded-md',
            'size-8 pointer-coarse:size-10',
            'text-faint',
            'transition-colors duration-100 hover:bg-hover hover:text-foreground',
          )}
        >
          <ChevronRight
            className={cn(
              'size-4 transition-transform duration-100',
              open && 'rotate-90',
            )}
          />
        </button>
        <StatusBadge status={f.status} />
        <span
          className={cn(
            'min-w-0 truncate font-medium',
            viewed && 'text-muted-foreground',
          )}
          title={f.path}
        >
          {renamed && (
            <span className="font-normal text-muted-foreground">
              {f.old_path} <span className="text-faint">→</span>{' '}
            </span>
          )}
          {f.path}
        </span>
        <Counts add={f.additions} del={f.deletions} />
        <span
          className={cn(
            'flex shrink-0 items-center max-sm:hidden',
            'opacity-0 pointer-coarse:opacity-100',
            'transition-opacity duration-100 focus-within:opacity-100 group-hover:opacity-100',
          )}
        >
          <CopyButton text={f.path} title="Copy path" what="Path" />
          {f.status !== 'deleted' && (
            <Tooltip label="View file at this revision">
              <Link
                {...repoLink(ctx.repo, {
                  kind: 'blob',
                  ref: ctx.newRev,
                  path: f.path,
                })}
                className={cn(
                  'grid place-items-center rounded-md',
                  'size-8',
                  'text-muted-foreground',
                  'hover:bg-accent hover:text-foreground',
                )}
                aria-label="View file"
              >
                <FileCodeCorner className="size-4" />
              </Link>
            </Tooltip>
          )}
        </span>
        <div className="flex-1" />
        <Tooltip label={viewed ? 'Mark not viewed' : 'Mark viewed'}>
          <button
            type="button"
            onClick={() => ctx.onToggleViewed(file)}
            aria-pressed={viewed}
            className={cn(
              'flex items-center rounded-md',
              'h-8 shrink-0 gap-2 px-2.5 pointer-coarse:h-10',
              'text-muted-foreground text-sm',
              'transition-colors duration-100 hover:bg-hover hover:text-foreground',
              viewed && 'text-foreground',
            )}
          >
            <span
              className={cn(
                'grid place-items-center rounded-[4px]',
                'size-4',
                'shadow-[inset_0_0_0_1.5px_var(--input)] text-primary-foreground',
                viewed && 'bg-primary shadow-none',
              )}
            >
              {viewed && <Check className="size-3" strokeWidth={3} />}
            </span>
            <span className="max-sm:hidden">Viewed</span>
          </button>
        </Tooltip>
      </div>
    </div>
  )
}
