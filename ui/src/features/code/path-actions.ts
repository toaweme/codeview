import { Copy, Download, FileCodeCorner, FolderTree, Link2 } from 'lucide-react'
import { apiUrl } from '@/api/client'
import type { ResolvedRef } from '@/api/queries'
import type { Crumb, MenuItem } from '@/features/shell/top-line'
import { copyText } from '@/lib/clipboard'
import { repoBase, repoParent } from '@/lib/repo-name'
import { repoLink } from '@/lib/url'

export function repoCrumbs(repo: string): Crumb[] {
  const org = repoParent(repo)
  const name: Crumb = {
    key: 'repo',
    label: repoBase(repo),
    menu: { kind: 'repo', repo },
  }
  if (!org) return [name]
  return [{ key: 'org', label: org, menu: { kind: 'org', org } }, name]
}

export function copyPageLink() {
  void copyText(window.location.href, 'Link')
}

const copyLinkItem: MenuItem = {
  key: 'copy-link',
  label: 'Copy link',
  icon: Link2,
  shortcut: 'repo.copyLink',
  run: copyPageLink,
}

export function historyActions(
  repo: string,
  resolved: ResolvedRef | null,
  path: string,
  file: boolean | undefined,
): MenuItem[] {
  const out: MenuItem[] = [copyLinkItem]
  if (!resolved) return out
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
  if (!resolved) return [copyLinkItem]
  const out: MenuItem[] = []
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
  out.push(copyLinkItem)
  return out
}
