import { Link, useLocation, useNavigate } from '@tanstack/react-router'
import {
  Code2,
  Copy,
  GitBranch,
  GitCommitHorizontal,
  GitCompareArrows,
  Link2,
  Pin,
  RotateCcwClock,
  ScanText,
  Tag,
} from 'lucide-react'
import { useState } from 'react'
import { resolveRef, useResolvedRef } from '@/api/queries'
import { Badge } from '@/components/badge'
import { Segmented } from '@/components/segmented'
import { FileView } from '@/features/code/file-view'
import { copyRepoLink } from '@/features/code/path-actions'
import { TreeView } from '@/features/code/tree-view'
import { CommitPage } from '@/features/commit/commit-page'
import { ComparePage } from '@/features/commit/compare-page'
import { CommitsView } from '@/features/commits/commits-view'
import {
  AppShell,
  type Section,
  SidebarHeader,
} from '@/features/shell/app-shell'
import { SidebarSlot } from '@/features/shell/sidebar-slot'
import { ErrorState } from '@/features/shell/states'
import { copyText } from '@/lib/clipboard'
import { cn } from '@/lib/cn'
import { type Command, useCommands } from '@/lib/commands'
import { shortHash } from '@/lib/format'
import { useKeys } from '@/lib/keymap'
import { type RepoLocation, type RepoView, repoLink } from '@/lib/url'
import { usePersistedState } from '@/lib/use-persisted-state'
import { RefSwitcher } from './ref-switcher'
import { BranchesView, ReleasesView } from './refs-views'
import { TreeFilter } from './tree-filter'

function hasRef(
  view: RepoView,
): view is Extract<RepoView, { ref?: string; path: string }> {
  return (
    view.kind === 'tree' ||
    view.kind === 'blob' ||
    view.kind === 'blame' ||
    view.kind === 'commits'
  )
}

export function RepoPage({ loc }: { loc: RepoLocation }) {
  const { repo, view } = loc
  const navigate = useNavigate()
  const hash = useLocation({ select: (l) => l.hash })
  const viewRef = hasRef(view) ? view.ref : undefined
  const { resolved, refs } = useResolvedRef(repo, viewRef)
  const [slot, setSlot] = useState<HTMLDivElement | null>(null)
  const [pane, setPane] = usePersistedState<'files' | 'changes'>(
    'sidebar:diff-pane',
    'changes',
  )

  const linkRef = viewRef
  const name = repo.slice(repo.indexOf('/') + 1)
  const isFile = view.kind === 'blob' || view.kind === 'blame'

  const goCode = () =>
    navigate(repoLink(repo, { kind: 'tree', ref: linkRef, path: '' }))
  const goHistory = () =>
    navigate(
      repoLink(repo, {
        kind: 'commits',
        ref: linkRef,
        path: hasRef(view) ? view.path : '',
      }),
    )
  const pin = () => {
    if (!hasRef(view) || !resolved?.commit || view.ref === resolved.commit)
      return
    navigate({
      ...repoLink(repo, { ...view, ref: resolved.commit }),
      hash: hash || undefined,
      replace: true,
      resetScroll: false,
    })
  }
  const toggleBlame = () => {
    if (view.kind !== 'blob' && view.kind !== 'blame') return
    navigate({
      ...repoLink(repo, {
        kind: view.kind === 'blob' ? 'blame' : 'blob',
        ref: view.ref,
        path: view.path,
      }),
      hash: hash || undefined,
      resetScroll: false,
    })
  }
  const switchRef = (ref: string) => {
    const r = refs.data && ref === refs.data.default ? undefined : ref
    navigate(
      repoLink(
        repo,
        hasRef(view) ? { ...view, ref: r } : { kind: 'tree', ref: r, path: '' },
      ),
    )
  }

  const copyPath =
    (view.kind === 'blob' || view.kind === 'blame' || view.kind === 'tree') &&
    view.path
      ? () => void copyText(view.path, 'Path')
      : undefined
  const copyLink = () => copyRepoLink(repo, view, resolved?.commit)

  useKeys({ 'repo.copyPermalink': copyLink })

  const commands: Command[] = [
    {
      id: 'repo:code',
      label: 'Go to code',
      icon: Code2,
      run: goCode,
    },
    {
      id: 'repo:history',
      label: 'Go to history',
      icon: RotateCcwClock,
      run: goHistory,
    },
    {
      id: 'repo:branches',
      label: 'Go to branches',
      icon: GitBranch,
      run: () => navigate(repoLink(repo, { kind: 'branches' })),
    },
    {
      id: 'repo:releases',
      label: 'Go to releases',
      icon: Tag,
      run: () => navigate(repoLink(repo, { kind: 'releases' })),
    },
    {
      id: 'repo:compare',
      label: 'Compare branches',
      icon: GitCompareArrows,
      run: () =>
        navigate(repoLink(repo, { kind: 'compare', base: '', head: '' })),
    },
  ]
  if (isFile) {
    commands.unshift({
      id: 'repo:blame',
      label: view.kind === 'blame' ? 'Hide blame' : 'Show blame',
      icon: ScanText,
      run: toggleBlame,
    })
  }
  if (hasRef(view) && resolved?.commit && view.ref !== resolved.commit) {
    commands.push({
      id: 'repo:pin',
      label: 'Pin the URL to the current commit',
      icon: Pin,
      run: pin,
    })
  }
  commands.push({
    id: 'repo:permalink',
    label: hasRef(view) ? 'Copy permalink' : 'Copy link',
    icon: Link2,
    shortcut: 'repo.copyPermalink',
    run: copyLink,
  })
  if (copyPath) {
    commands.push({
      id: 'repo:copy-path',
      label: 'Copy path',
      icon: Copy,
      run: copyPath,
    })
  }
  useCommands(commands)

  const section: Section =
    view.kind === 'commits' || view.kind === 'commit'
      ? 'history'
      : view.kind === 'compare'
        ? 'compare'
        : 'code'

  let body: React.ReactNode
  if (refs.isError && hasRef(view) && !view.ref) {
    body = <ErrorState error={refs.error} />
  } else {
    switch (view.kind) {
      case 'tree':
        body = <TreeView repo={repo} resolved={resolved} path={view.path} />
        break
      case 'blob':
      case 'blame':
        body = (
          <FileView
            repo={repo}
            resolved={resolved}
            path={view.path}
            blame={view.kind === 'blame'}
          />
        )
        break
      case 'commits':
        body = <CommitsView repo={repo} resolved={resolved} path={view.path} />
        break
      case 'commit':
        body = <CommitPage repo={repo} hash={view.hash} />
        break
      case 'branches':
        body = <BranchesView repo={repo} />
        break
      case 'releases':
        body = <ReleasesView repo={repo} />
        break
      case 'compare':
        body = (
          <ComparePage
            repo={repo}
            base={view.base}
            head={view.head}
            mode={view.mode}
          />
        )
        break
    }
  }

  const treeResolved = hasRef(view)
    ? resolved
    : view.kind === 'compare' && view.head
      ? resolveRef(refs.data, view.head)
      : resolveRef(refs.data)
  const hasChanges =
    view.kind === 'commit' ||
    (view.kind === 'compare' && !!view.base && !!view.head)
  const showFiles = !hasChanges || pane === 'files'

  const sidebar = (
    <>
      <SidebarHeader>
        <Link
          {...repoLink(repo, { kind: 'tree', ref: linkRef, path: '' })}
          title={repo}
          className="min-w-0 shrink truncate rounded-md font-semibold tracking-tight transition-colors duration-100 hover:text-primary"
        >
          {name}
        </Link>
        <div className="ml-auto flex min-w-0 shrink-[2] justify-end">
          {hasRef(view) ? (
            <RefSwitcher
              repo={repo}
              view={view}
              resolved={resolved}
              refs={refs.data}
            />
          ) : view.kind === 'commit' ? (
            <Badge>
              <GitCommitHorizontal aria-hidden />
              {shortHash(view.hash)}
            </Badge>
          ) : view.kind === 'branches' ? (
            <Badge>
              <GitBranch aria-hidden />
              branches
            </Badge>
          ) : view.kind === 'releases' ? (
            <Badge>
              <Tag aria-hidden />
              releases
            </Badge>
          ) : null}
        </div>
      </SidebarHeader>
      {hasChanges && (
        <div className="shrink-0 px-2 pb-3">
          <Segmented
            fill
            value={pane}
            onChange={setPane}
            options={[
              { value: 'changes', label: 'Changes' },
              { value: 'files', label: 'Files' },
            ]}
          />
        </div>
      )}
      {showFiles && treeResolved && (
        <TreeFilter
          repo={repo}
          resolved={treeResolved}
          current={hasRef(view) ? view.path : ''}
        />
      )}
      <div
        ref={setSlot}
        className={cn(
          'flex min-h-0 flex-1 flex-col',
          (!hasChanges || showFiles) && 'hidden',
        )}
      />
    </>
  )

  return (
    <AppShell
      section={section}
      sidebar={sidebar}
      repo={repo}
      linkRef={linkRef}
      resolved={resolved}
      refs={refs.data}
      onRef={switchRef}
    >
      <SidebarSlot.Provider value={slot}>{body}</SidebarSlot.Provider>
    </AppShell>
  )
}
