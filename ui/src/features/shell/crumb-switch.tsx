import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useMemo } from 'react'
import { reposQuery } from '@/api/queries'
import { Select } from '@/components/select'
import { useRepoNames } from '@/features/repos/use-repo-names'
import { repoBase, repoParent } from '@/lib/repo-name'
import { groupLink, repoLink } from '@/lib/url'

export type CrumbMenu =
  | { kind: 'org'; org: string }
  | { kind: 'repo'; repo: string }

export function CrumbSwitch({
  menu,
  className,
  trigger,
}: {
  menu: CrumbMenu
  className?: string
  trigger: string
}) {
  const q = useQuery(reposQuery())
  const navigate = useNavigate()
  const names = useRepoNames()
  const org = menu.kind === 'org' ? menu.org : repoParent(menu.repo)

  const options = useMemo(() => {
    const all = (q.data?.repos ?? []).map((r) => r.name)
    if (menu.kind === 'org')
      return [...new Set(all.map(repoParent))]
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b))
        .map((o) => ({ value: o, label: names.display(o) }))
    return all
      .filter((n) => repoParent(n) === org)
      .sort((a, b) => a.localeCompare(b))
      .map((n) => ({ value: n, label: repoBase(n) }))
  }, [q.data, menu.kind, org, names])

  const value = menu.kind === 'org' ? menu.org : menu.repo
  const current = options.some((o) => o.value === value)
    ? options
    : [
        {
          value,
          label: menu.kind === 'org' ? names.display(value) : repoBase(value),
        },
        ...options,
      ]

  return (
    <Select
      label={menu.kind === 'org' ? 'Switch group' : 'Switch repository'}
      value={value}
      options={current}
      onChange={(v) =>
        navigate(
          menu.kind === 'org'
            ? groupLink(v)
            : repoLink(v, { kind: 'tree', path: '' }),
        )
      }
      className={className}
      trigger={trigger}
    />
  )
}
