import { Link, useLocation, useNavigate } from '@tanstack/react-router'
import { Code2, Copy, Link2, Pin, ScanText } from 'lucide-react'
import { resolveRef, useResolvedRef } from '@/api/queries'
import { FileView } from '@/features/code/file-view'
import { copyRepoLink } from '@/features/code/path-actions'
import { TreeView } from '@/features/code/tree-view'
import {
  AppShell,
  type Section,
  SidebarHeader,
} from '@/features/shell/app-shell'
import { ErrorState } from '@/features/shell/states'
import { copyText } from '@/lib/clipboard'
import { type Command, useCommands } from '@/lib/commands'
import { useKeys } from '@/lib/keymap'
import { type RepoLocation, type RepoView, repoLink } from '@/lib/url'
import { RefSwitcher } from './ref-switcher'
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

  const linkRef = viewRef
  const name = repo.slice(repo.indexOf('/') + 1)
  const isFile = view.kind === 'blob' || view.kind === 'blame'

  const goCode = () =>
    navigate(repoLink(repo, { kind: 'tree', ref: linkRef, path: '' }))
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
    }
  }

  const treeResolved = hasRef(view) ? resolved : resolveRef(refs.data)

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
          ) : null}
        </div>
      </SidebarHeader>
      {treeResolved && (
        <TreeFilter
          repo={repo}
          resolved={treeResolved}
          current={hasRef(view) ? view.path : ''}
        />
      )}
    </>
  )

  return (
    <AppShell section={section} sidebar={sidebar} repo={repo} linkRef={linkRef}>
      {body}
    </AppShell>
  )
}
