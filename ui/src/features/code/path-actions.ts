import {
  Copy,
  Download,
  FileCodeCorner,
  FolderTree,
  Link,
  Link2,
} from 'lucide-react'
import { apiUrl } from '@/api/client'
import type { ResolvedRef } from '@/api/queries'
import type { Crumb, MenuItem } from '@/features/shell/top-line'
import { copyText } from '@/lib/clipboard'
import { type RepoView, repoLink, repoPermalink } from '@/lib/url'

export function repoCrumbs(repo: string, ref?: string): Crumb[] {
  const org = repo.slice(0, repo.indexOf('/'))
  const name = repo.slice(repo.indexOf('/') + 1)
  return [
    {
      key: 'org',
      label: org,
      link: { to: '/$org/$', params: { org, _splat: '' } },
    },
    {
      key: 'repo',
      label: name,
      link: repoLink(repo, { kind: 'tree', ref, path: '' }),
    },
  ]
}

// copyRepoLink copies the URL of the repo page being viewed,
// pinned to commit when the view carries a ref.
export function copyRepoLink(repo: string, view: RepoView, commit?: string) {
  void copyText(repoPermalink(window.location.href, repo, view, commit), 'Link')
}

export function historyActions(
  repo: string,
  resolved: ResolvedRef | null,
  path: string,
  file: boolean | undefined,
): MenuItem[] {
  const out: MenuItem[] = [
    {
      key: 'copy-link',
      label: 'Copy link',
      icon: Link,
      run: () => void copyText(window.location.href, 'Link'),
    },
  ]
  if (!resolved) return out
  out.push({
    key: 'permalink',
    label: 'Copy permalink',
    icon: Link2,
    run: () => copyRepoLink(repo, { kind: 'commits', path }, resolved.commit),
  })
  if (file !== undefined) {
    const ref = resolved.isDefault ? undefined : resolved.name
    out.push({
      key: 'view',
      label: file ? 'View file at this ref' : 'Browse files at this ref',
      icon: file ? FileCodeCorner : FolderTree,
      link: repoLink(repo, { kind: file ? 'blob' : 'tree', ref, path }),
    })
  }
  return out
}

export function pathActions(
  repo: string,
  resolved: ResolvedRef | null,
  view: { kind: 'tree' | 'blob' | 'blame'; path: string },
): MenuItem[] {
  const { path } = view
  const file = view.kind !== 'tree'
  const out: MenuItem[] = []
  if (!resolved) return out
  if (file) {
    const raw = apiUrl('raw', { repo, ref: resolved.rev, path })
    out.push(
      {
        key: 'raw',
        label: 'Open raw file',
        icon: FileCodeCorner,
        href: raw,
        run: () => window.open(raw, '_blank', 'noreferrer'),
      },
      {
        key: 'download',
        label: 'Download',
        icon: Download,
        run: () => {
          const a = document.createElement('a')
          a.href = raw
          a.download = path.slice(path.lastIndexOf('/') + 1)
          a.click()
        },
      },
    )
  }
  if (path) {
    out.push({
      key: 'copy-path',
      label: 'Copy path',
      icon: Copy,
      run: () => void copyText(path, 'Path'),
    })
  }
  out.push({
    key: 'permalink',
    label: 'Copy permalink',
    icon: Link2,
    shortcut: 'repo.copyPermalink',
    run: () => copyRepoLink(repo, view, resolved.commit),
  })
  return out
}
