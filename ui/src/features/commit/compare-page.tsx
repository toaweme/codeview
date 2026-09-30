import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import {
  ArrowLeftRight,
  ArrowRight,
  ChevronRight,
  ChevronsUpDown,
  Link2,
  Plus,
} from 'lucide-react'
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { compareQuery, refsQuery, revisionQuery } from '@/api/queries'
import type { Commit, Compare, Refs } from '@/api/types'
import { Badge, Counts } from '@/components/badge'
import { Segmented } from '@/components/segmented'
import { Tooltip } from '@/components/tooltip'
import { Button } from '@/components/ui/button'
import { repoCrumbs } from '@/features/code/path-actions'
import { DiffTopLine, DiffView } from '@/features/diff/diff-view'
import { refIcon } from '@/features/repo/ref-icon'
import { RefPicker } from '@/features/repo/ref-switcher'
import { ErrorState, Skeleton } from '@/features/shell/states'
import type { Crumb, MenuItem } from '@/features/shell/top-line'
import { copyText } from '@/lib/clipboard'
import { cn } from '@/lib/cn'
import { useCommands } from '@/lib/commands'
import { shortHash } from '@/lib/format'
import { relativeTime } from '@/lib/time'
import {
  type CompareMode,
  isCommitHash,
  isRevision,
  repoLink,
  splitRevision,
} from '@/lib/url'
import { type CompareView, compareView } from './compare-state'
import { buildPresets, type Mode, middleTruncate } from './presets'

const toUrlMode = (m: Mode): CompareMode | undefined =>
  m === 'direct' ? 'direct' : undefined

const commitCount = (n: number) =>
  `${n >= 250 ? '250+' : n} ${n === 1 ? 'commit' : 'commits'}`

function refLabel(rev: string): string {
  const { name, suffix } = splitRevision(rev)
  return (isCommitHash(name) ? shortHash(name) : name) + suffix
}

function RefName({ rev, max = 32 }: { rev: string; max?: number }) {
  return <span title={rev}>{middleTruncate(refLabel(rev), max)}</span>
}

function Title({
  from,
  to,
  view,
}: {
  from: string
  to: string
  view: CompareView
}) {
  const f = <RefName rev={from} />
  const t = <RefName rev={to} />
  if (view.shape === 'same') return <>Nothing to compare</>
  if (view.shape === 'reversed')
    return (
      <>
        {t} is behind {f}
      </>
    )
  if (view.mode === 'direct')
    return (
      <>
        Everything that differs between {f} and {t}
      </>
    )
  return (
    <>
      What {t} adds since {f}
    </>
  )
}

export function ComparePage({
  repo,
  base,
  head,
  mode: urlMode,
}: {
  repo: string
  base: string
  head: string
  mode?: CompareMode
}) {
  const navigate = useNavigate()
  const refs = useQuery(refsQuery(repo))
  const ready = !!base && !!head
  const q = useQuery({
    ...compareQuery(repo, base, head, urlMode),
    enabled: ready,
    // same refs keep the previous answer on screen while refetching
    placeholderData: (prev, prevQuery) =>
      prevQuery?.queryKey[2] === base && prevQuery.queryKey[3] === head
        ? prev
        : undefined,
  })
  const view = q.data ? compareView(q.data, urlMode) : undefined
  const idleMode = !!view?.dropMode
  const mode: Mode = view
    ? view.mode
    : urlMode === 'direct'
      ? 'direct'
      : 'since'

  const go = (from: string, to: string, m: Mode) =>
    navigate(
      repoLink(repo, {
        kind: 'compare',
        base: from,
        head: to,
        mode: toUrlMode(m),
      }),
    )
  const swap = () => go(head, base, mode)

  useEffect(() => {
    if (idleMode)
      navigate({
        ...repoLink(repo, { kind: 'compare', base, head }),
        replace: true,
      })
  }, [idleMode, navigate, repo, base, head])

  useCommands(
    ready
      ? [
          {
            id: 'compare:swap',
            label: 'Swap From and To',
            icon: ArrowLeftRight,
            run: swap,
          },
        ]
      : [],
  )

  const crumbs: Crumb[] = [
    ...repoCrumbs(repo),
    {
      key: 'compare',
      label: 'Compare',
      link: repoLink(repo, { kind: 'compare', base: '', head: '' }),
    },
  ]
  if (ready)
    crumbs.push({
      key: 'spec',
      label: `${refLabel(base)}${mode === 'direct' ? '..' : '...'}${refLabel(head)}`,
    })
  const actions: MenuItem[] = [
    {
      key: 'copy-link',
      label: 'Copy link',
      icon: Link2,
      run: () => void copyText(window.location.href, 'Link'),
    },
  ]

  if (!ready)
    return (
      <>
        <DiffTopLine crumbs={crumbs} actions={actions} />
        <CompareForm
          key={`${base}...${head}`}
          repo={repo}
          refs={refs.data}
          base={base}
          head={head}
          urlMode={urlMode}
          go={go}
        />
      </>
    )

  const summary = (
    <SummaryRow
      repo={repo}
      refs={refs.data}
      from={base}
      to={head}
      data={q.data}
      view={view}
      onFrom={(name) => go(name, head, mode)}
      onTo={(name) => go(base, name, mode)}
      onSwap={swap}
    />
  )
  if (q.isPending || q.isError || !view)
    return (
      <>
        <DiffTopLine crumbs={crumbs} actions={actions} />
        {summary}
        {q.isError ? <ErrorState error={q.error} /> : <Skeleton lines={16} />}
      </>
    )
  const header = (
    <CommitList
      repo={repo}
      data={q.data}
      view={view}
      from={base}
      to={head}
      onMode={(m) => go(base, head, m)}
      onSwap={swap}
      onInclude={(parent) => go(parent, head, mode)}
    />
  )
  if (!view.diff)
    return (
      <>
        <DiffTopLine crumbs={crumbs} actions={actions} />
        {summary}
        <div className="min-h-0 flex-1 overflow-auto">{header}</div>
      </>
    )
  const oldRev =
    mode === 'direct' ? q.data.base || base : q.data.merge_base || base
  return (
    <DiffView
      key={`${base}...${head}:${mode}`}
      repo={repo}
      files={q.data.files}
      viewKey={`${oldRev}...${q.data.head || head}`}
      newRev={q.data.head || head}
      oldRev={oldRev}
      banner={summary}
      header={header}
      crumbs={crumbs}
      actions={actions}
    />
  )
}

function CompareForm({
  repo,
  refs,
  base,
  head,
  urlMode,
  go,
}: {
  repo: string
  refs?: Refs
  base: string
  head: string
  urlMode?: CompareMode
  go: (from: string, to: string, mode: Mode) => void
}) {
  // null means untouched, so From follows the default branch
  const [fromPick, setFrom] = useState<string | null>(base || null)
  const [to, setTo] = useState(head)
  const from = fromPick ?? refs?.default ?? ''
  const mode: Mode = urlMode === 'direct' ? 'direct' : 'since'

  const canCompare = !!from && !!to && from !== to
  const submit = () => {
    if (canCompare) go(from, to, mode)
  }
  const swap = () => {
    setFrom(to)
    setTo(from)
  }
  const compareRef = useRef<HTMLButtonElement>(null)
  // a disabled button refuses focus, so wait for the render that enables it
  const [focusCompare, setFocusCompare] = useState(false)
  useEffect(() => {
    if (!focusCompare) return
    compareRef.current?.focus()
    setFocusCompare(false)
  }, [focusCompare])

  const presets = useMemo(() => buildPresets(refs), [refs])

  return (
    <div className="min-h-0 flex-1 overflow-auto px-4 sm:px-6">
      <div className="mx-auto w-full max-w-[720px] pt-6 pb-16 sm:pt-[12vh]">
        <h1 className="text-center font-semibold text-2xl tracking-tight">
          Compare changes
        </h1>
        <p className="mt-1.5 text-center text-muted-foreground">
          See what changed from one branch, tag or commit to another.
        </p>
        <form
          className="mt-6 rounded-2xl bg-island-muted p-4 sm:p-5"
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
          onKeyDown={(e) => {
            // keys from the portalled picker bubble here through React, leave them to it
            if (
              e.key !== 'Enter' ||
              e.defaultPrevented ||
              !canCompare ||
              !e.currentTarget.contains(e.target as Node)
            )
              return
            e.preventDefault()
            submit()
          }}
        >
          <div
            className={cn(
              'grid grid-cols-1 items-end',
              'gap-2',
              'sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:gap-3',
            )}
          >
            <FormSide
              label="From"
              repo={repo}
              refs={refs}
              value={from}
              onChoose={setFrom}
            />
            <SwapButton onClick={swap} className="mx-auto sm:mb-1" />
            <FormSide
              label="To"
              repo={repo}
              refs={refs}
              value={to}
              onChoose={setTo}
            />
          </div>
          <div className="mt-4 flex items-center justify-end">
            <Button
              ref={compareRef}
              type="submit"
              variant="primary"
              size="md"
              disabled={!canCompare}
              className="shrink-0 text-sm"
            >
              Compare
            </Button>
          </div>
        </form>
        {presets.length > 0 && (
          <div className="mt-6">
            <div className="mb-2 font-medium text-muted-foreground text-sm">
              Suggestions
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {presets.map((p) => (
                <Tooltip
                  key={p.key}
                  label={
                    <>
                      <div className="font-medium">
                        {p.from} → {p.to}
                      </div>
                      <div className="opacity-80">{p.title}</div>
                    </>
                  }
                  side="bottom"
                >
                  <button
                    type="button"
                    aria-label={p.title}
                    onClick={() => {
                      setFrom(p.from)
                      setTo(p.to)
                      setFocusCompare(true)
                    }}
                    className={cn(
                      'flex items-center rounded-lg',
                      'h-9 min-w-0 gap-1.5 px-3',
                      'whitespace-nowrap bg-island-muted text-sm',
                      'transition-colors duration-100',
                      'hover:bg-hover',
                      'focus-visible:outline-2 focus-visible:outline-ring',
                    )}
                  >
                    <PresetRef name={p.from} />
                    <ArrowRight
                      className="size-3.5 shrink-0 text-faint"
                      aria-hidden
                    />
                    <PresetRef name={p.to} />
                  </button>
                </Tooltip>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function PresetRef({ name }: { name: string }) {
  return (
    <span className="min-w-0 max-w-[180px] truncate" title={name}>
      {middleTruncate(name, 24)}
    </span>
  )
}

function FormSide({
  label,
  repo,
  refs,
  value,
  onChoose,
}: {
  label: string
  repo: string
  refs?: Refs
  value: string
  onChoose: (name: string) => void
}) {
  const Icon = refIcon(refs, value)
  return (
    <div className="min-w-0">
      <div className="mb-1.5 font-medium text-sm">{label}</div>
      <RefPicker
        refs={refs}
        current={value}
        onChoose={onChoose}
        revisionsIn={repo}
      >
        <button
          type="button"
          aria-label={value ? `${label}, ${value}` : `Pick ${label}`}
          className={cn(
            'flex items-center rounded-xl',
            'h-11 w-full min-w-0 gap-2 px-3.5',
            'bg-background text-left',
            'transition-shadow duration-100',
            'hover:shadow-[0_1px_3px_rgb(0_0_0/0.1)]',
            'focus-visible:outline-2 focus-visible:outline-ring',
            'data-[state=open]:ring-2 data-[state=open]:ring-ring/40',
          )}
        >
          {value ? (
            <>
              <Icon className="size-4 shrink-0 text-primary" aria-hidden />
              <span className="min-w-0 flex-1 truncate font-medium">
                {refLabel(value)}
              </span>
              <RevisionHash repo={repo} rev={value} />
              {refs && value === refs.default && (
                <Badge tone="primary">default</Badge>
              )}
            </>
          ) : (
            <span className="min-w-0 flex-1 truncate text-faint">
              Branch, tag or commit
            </span>
          )}
          <ChevronsUpDown className="size-4 shrink-0 text-faint" aria-hidden />
        </button>
      </RefPicker>
    </div>
  )
}

function SwapButton({
  onClick,
  className,
}: {
  onClick: () => void
  className?: string
}) {
  return (
    <Tooltip label="Swap From and To">
      <button
        type="button"
        aria-label="Swap From and To"
        onClick={onClick}
        className={cn(
          'flex shrink-0 items-center justify-center rounded-lg',
          'size-9',
          'text-muted-foreground',
          'transition-colors duration-100',
          'hover:bg-hover hover:text-foreground',
          'focus-visible:outline-2 focus-visible:outline-ring',
          className,
        )}
      >
        <ArrowLeftRight className="size-4 rotate-90 sm:rotate-0" aria-hidden />
      </button>
    </Tooltip>
  )
}

function SummaryRow({
  repo,
  refs,
  from,
  to,
  data,
  view,
  onFrom,
  onTo,
  onSwap,
}: {
  repo: string
  refs?: Refs
  from: string
  to: string
  data?: Compare
  view?: CompareView
  onFrom: (name: string) => void
  onTo: (name: string) => void
  onSwap: () => void
}) {
  const totals = useMemo(
    () =>
      (data?.files ?? []).reduce(
        (acc, f) => ({
          add: acc.add + f.additions,
          del: acc.del + f.deletions,
        }),
        { add: 0, del: 0 },
      ),
    [data],
  )
  const commits = data?.commits.length ?? 0
  const after =
    view?.startingPoint &&
    data?.boundary &&
    (isCommitHash(from) || isRevision(from))
      ? shortHash(data.boundary.hash)
      : ''
  return (
    <div
      className={cn(
        'flex shrink-0 items-center overflow-hidden rounded-xl',
        'mx-3 my-3 h-12 gap-2 px-1.5',
        'bg-island-muted',
      )}
    >
      <SummarySide
        label="From"
        repo={repo}
        refs={refs}
        value={from}
        onChoose={onFrom}
      />
      <ArrowRight className="size-4 shrink-0 text-faint" aria-hidden />
      <SummarySide
        label="To"
        repo={repo}
        refs={refs}
        value={to}
        onChoose={onTo}
      />
      <SwapButton onClick={onSwap} />
      {data && view && view.shape !== 'same' && (
        <span
          className={cn(
            'hidden shrink-0 items-center',
            'ml-auto gap-1.5 pr-1.5',
            'whitespace-nowrap',
            'md:flex',
          )}
        >
          {view.shape === 'reversed' ? (
            <Badge tone="warn" className="num">
              {commitCount(data.behind)} behind
            </Badge>
          ) : (
            <Badge className="num">{commitCount(commits)}</Badge>
          )}
          {after && (
            <span className="num text-muted-foreground text-sm">
              after {after}
            </span>
          )}
          {view.diff && <Counts add={totals.add} del={totals.del} />}
        </span>
      )}
    </div>
  )
}

function SummarySide({
  label,
  repo,
  refs,
  value,
  onChoose,
}: {
  label: string
  repo: string
  refs?: Refs
  value: string
  onChoose: (name: string) => void
}) {
  const Icon = refIcon(refs, value)
  return (
    <RefPicker
      refs={refs}
      current={value}
      onChoose={onChoose}
      revisionsIn={repo}
    >
      <button
        type="button"
        aria-label={`${label}, ${value}. Change`}
        className={cn(
          'flex items-center rounded-lg',
          'h-9 min-w-0 max-w-64 gap-1.5 px-2.5',
          'whitespace-nowrap bg-background text-sm',
          'transition-shadow duration-100',
          'hover:shadow-[0_1px_3px_rgb(0_0_0/0.1)]',
          'focus-visible:outline-2 focus-visible:outline-ring',
          'data-[state=open]:ring-2 data-[state=open]:ring-ring/40',
        )}
      >
        <span className="shrink-0 text-muted-foreground">{label}</span>
        <Icon className="size-3.5 shrink-0 text-primary" aria-hidden />
        <span className="truncate font-medium text-primary">
          {refLabel(value)}
        </span>
        <RevisionHash repo={repo} rev={value} />
      </button>
    </RefPicker>
  )
}

function RevisionHash({ repo, rev }: { repo: string; rev: string }) {
  const q = useQuery({
    ...revisionQuery(repo, rev),
    enabled: isRevision(rev),
  })
  if (!isRevision(rev) || !q.data) return null
  return (
    <span className="num shrink-0 text-faint text-sm">
      {shortHash(q.data.hash)}
    </span>
  )
}

function CommitList({
  repo,
  data,
  view,
  from,
  to,
  onMode,
  onSwap,
  onInclude,
}: {
  repo: string
  data: Compare
  view: CompareView
  from: string
  to: string
  onMode: (m: Mode) => void
  onSwap: () => void
  onInclude: (parent: string) => void
}) {
  const [open, setOpen] = useState(data.commits.length <= 12)
  const n = data.commits.length
  const boundary = view.startingPoint ? data.boundary : null
  const listed = view.shape === 'forward' || view.shape === 'diverged'
  return (
    <div className="max-w-5xl px-3 pt-3 pb-6 sm:px-6">
      <h1 className="min-w-0 truncate font-semibold text-xl tracking-tight">
        <Title from={from} to={to} view={view} />
      </h1>
      {view.shape === 'same' && (
        <p className="mt-2 text-muted-foreground text-sm">
          <RefName rev={from} /> and <RefName rev={to} /> point at the same
          commit.
        </p>
      )}
      {view.shape === 'reversed' && (
        <Reversed
          from={from}
          to={to}
          behind={data.behind}
          mode={view.mode}
          onMode={onMode}
          onSwap={onSwap}
        />
      )}
      {view.toggle && (
        <Divergence
          from={from}
          to={to}
          ahead={data.ahead}
          behind={data.behind}
          mode={view.mode}
          onMode={onMode}
        />
      )}
      {listed && n > 0 && (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className={cn(
            'flex items-center rounded-lg',
            '-ml-2 mt-2 h-8 max-w-full gap-2 px-2',
            'whitespace-nowrap text-muted-foreground text-sm',
            'transition-colors duration-100 hover:bg-hover hover:text-foreground',
          )}
        >
          <ChevronRight
            className={cn(
              'size-4 shrink-0 transition-transform duration-100',
              open && 'rotate-90',
            )}
          />
          <span className="num min-w-0 truncate">
            {commitCount(n)} on {middleTruncate(refLabel(to), 32)}
          </span>
        </button>
      )}
      {listed && open && (n > 0 || boundary) && (
        <ul className="mt-2 rounded-xl bg-island-muted p-1.5">
          {data.commits.map((c) => (
            <CommitRow key={c.hash} repo={repo} commit={c} />
          ))}
          {boundary && (
            <CommitRow
              repo={repo}
              commit={boundary}
              dimmed
              label="Starting point, not included"
              action={
                <IncludeButton
                  parent={boundary.parents[0]}
                  shared={view.mode === 'since' && boundary.hash !== data.base}
                  onInclude={onInclude}
                />
              }
            />
          )}
        </ul>
      )}
    </div>
  )
}

function Reversed({
  from,
  to,
  behind,
  mode,
  onMode,
  onSwap,
}: {
  from: string
  to: string
  behind: number
  mode: Mode
  onMode: (m: Mode) => void
  onSwap: () => void
}) {
  const f = middleTruncate(refLabel(from), 24)
  const t = middleTruncate(refLabel(to), 24)
  return (
    <div className="mt-3 rounded-xl bg-island-muted p-4">
      <p className="text-sm">
        <RefName rev={to} /> is{' '}
        <span className="num">{commitCount(behind)}</span> behind{' '}
        <RefName rev={from} />.
      </p>
      {mode === 'direct' && (
        <p className="mt-1 text-muted-foreground text-sm">
          Showing <RefName rev={from} /> → <RefName rev={to} /> as removals
        </p>
      )}
      <div className="mt-3 flex flex-col items-start gap-2 sm:flex-row sm:items-center">
        <Tooltip label="Swap the two sides">
          <Button variant="primary" size="sm" onClick={onSwap}>
            <ArrowLeftRight aria-hidden />
            See what {f} adds since {t}
          </Button>
        </Tooltip>
        {mode === 'direct' ? (
          <Button variant="ghost" size="sm" onClick={() => onMode('since')}>
            Hide removals
          </Button>
        ) : (
          <Button variant="ghost" size="sm" onClick={() => onMode('direct')}>
            Show as removals
          </Button>
        )}
      </div>
    </div>
  )
}

function CommitRow({
  repo,
  commit,
  dimmed = false,
  label,
  action,
}: {
  repo: string
  commit: Commit
  dimmed?: boolean
  label?: string
  action?: ReactNode
}) {
  const dim = dimmed && 'opacity-50'
  return (
    <li
      className={cn(
        'relative flex items-center rounded-lg',
        'h-(--row-h) gap-3 px-2.5 sm:gap-4 pointer-coarse:h-11',
        'whitespace-nowrap',
        'transition-colors duration-75 hover:bg-hover',
      )}
    >
      <span className="flex min-w-0 flex-1 items-center gap-2">
        <Link
          {...repoLink(repo, { kind: 'commit', hash: commit.hash })}
          aria-label={label && `${label}, ${commit.subject}`}
          className={cn(
            'min-w-0',
            'truncate outline-none',
            "after:absolute after:inset-0 after:rounded-lg after:content-['']",
            'focus-visible:after:outline-2 focus-visible:after:outline-ring',
            dim,
          )}
        >
          {commit.subject}
        </Link>
        {action}
      </span>
      <span
        className={cn(
          'hidden w-36 shrink-0 truncate text-muted-foreground text-sm sm:block',
          dim,
        )}
      >
        {commit.author.name}
      </span>
      <span
        className={cn(
          'w-20 shrink-0 truncate text-right text-faint text-sm sm:w-28',
          dim,
        )}
      >
        {relativeTime(commit.author.date)}
      </span>
      <span className={cn('flex w-20 shrink-0 justify-end', dim)}>
        <Badge>{shortHash(commit.hash)}</Badge>
      </span>
    </li>
  )
}

function IncludeButton({
  parent,
  shared,
  onInclude,
}: {
  parent: string
  shared: boolean
  onInclude: (parent: string) => void
}) {
  return (
    <Tooltip
      label={
        shared
          ? 'Start one commit earlier so this shared commit is included'
          : 'Start the comparison one commit earlier so this commit is included'
      }
    >
      <Button
        size="xs"
        variant="ghost"
        onClick={() => onInclude(parent)}
        className="relative z-10 shrink-0"
      >
        <Plus aria-hidden />
        Include
      </Button>
    </Tooltip>
  )
}

function Divergence({
  from,
  to,
  ahead,
  behind,
  mode,
  onMode,
}: {
  from: string
  to: string
  ahead: number
  behind: number
  mode: Mode
  onMode: (m: Mode) => void
}) {
  const f = refLabel(from)
  const t = refLabel(to)
  const count = commitCount(behind)
  const one = behind === 1
  const options: { value: Mode; label: string; title: string }[] = [
    {
      value: 'since',
      label: `Only ${middleTruncate(t, 20)}'s changes`,
      title: `Shows what was done on ${t}. The ${count} on ${f} since they split ${one ? 'is' : 'are'} left out, like a pull request.`,
    },
    {
      value: 'direct',
      label: 'Every difference',
      title: `Compares the two snapshots directly, so ${f}'s ${behind >= 250 ? '250+' : behind} newer ${one ? 'commit shows' : 'commits show'} up as removals.`,
    },
  ]
  return (
    <div className="mt-3 flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:gap-4">
      <p
        className={cn(
          'flex flex-wrap items-center',
          'min-w-0 max-w-full gap-x-1.5 gap-y-1',
          'text-muted-foreground text-sm',
        )}
      >
        <Side name={from} />
        <span className="shrink-0 whitespace-nowrap">
          has <span className="num">{count}</span>
        </span>
        <Side name={to} />
        <span className="shrink-0 whitespace-nowrap">doesn't,</span>
        <Side name={to} />
        <span className="shrink-0 whitespace-nowrap">
          has <span className="num">{commitCount(ahead)}</span>
        </span>
        <Side name={from} />
        <span className="shrink-0 whitespace-nowrap">doesn't.</span>
      </p>
      <Segmented value={mode} onChange={onMode} options={options} />
    </div>
  )
}

function Side({ name }: { name: string }) {
  return (
    <Badge tone="primary" title={name} className="min-w-0">
      <span className="truncate">{middleTruncate(refLabel(name), 28)}</span>
    </Badge>
  )
}
