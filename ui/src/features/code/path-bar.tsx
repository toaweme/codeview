import { Code2, RotateCcwClock, ScanText } from 'lucide-react'
import type { ResolvedRef } from '@/api/queries'
import {
  type Crumb,
  type SwitchItem,
  TopLine,
  ViewSwitch,
} from '@/features/shell/top-line'
import { repoLink } from '@/lib/url'
import { repoCrumbs } from './path-actions'

export function PathBar({
  repo,
  resolved,
  path,
  children,
}: {
  repo: string
  resolved: ResolvedRef | null
  path: string
  children?: React.ReactNode
}) {
  const parts = path.split('/').filter(Boolean)
  const ref = resolved && !resolved.isDefault ? resolved.name : undefined
  const crumbs: Crumb[] = [
    ...repoCrumbs(repo, ref),
    ...parts.map((p, i) => {
      const sub = parts.slice(0, i + 1).join('/')
      return {
        key: sub,
        label: p,
        link: repoLink(repo, { kind: 'tree', ref, path: sub }),
      }
    }),
  ]
  return <TopLine crumbs={crumbs}>{children}</TopLine>
}

export function ViewToggles({
  repo,
  resolved,
  path,
  active,
  file,
}: {
  repo: string
  resolved: ResolvedRef | null
  path: string
  active: 'code' | 'blame' | 'history'
  file: boolean | undefined
}) {
  const ref = resolved && !resolved.isDefault ? resolved.name : undefined
  const keepHash = (h: string | undefined) => h ?? ''
  const items: SwitchItem[] = [
    {
      key: 'code',
      label: 'Code',
      icon: Code2,
      active: active === 'code',
      disabled: file === undefined,
      link: repoLink(repo, { kind: file ? 'blob' : 'tree', ref, path }),
      hash: file ? keepHash : undefined,
    },
    {
      key: 'blame',
      label: 'Blame',
      icon: ScanText,
      active: active === 'blame',
      disabled: !file,
      link: repoLink(repo, { kind: 'blame', ref, path }),
      hash: keepHash,
    },
    {
      key: 'history',
      label: 'History',
      icon: RotateCcwClock,
      active: active === 'history',
      link: repoLink(repo, { kind: 'commits', ref, path }),
    },
  ]
  return <ViewSwitch label="View" items={items} />
}
