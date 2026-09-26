import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useMemo } from 'react'
import { reposQuery } from '@/api/queries'
import { Select } from '@/components/select'
import { repoLink, repoOrg } from '@/lib/url'

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
  const org = menu.kind === 'org' ? menu.org : repoOrg(menu.repo)

  const options = useMemo(() => {
    const names = (q.data?.repos ?? []).map((r) => r.name)
    if (menu.kind === 'org')
      return [...new Set(names.map(repoOrg))]
        .sort((a, b) => a.localeCompare(b))
        .map((o) => ({ value: o, label: o }))
    return names
      .filter((n) => repoOrg(n) === org)
      .sort((a, b) => a.localeCompare(b))
      .map((n) => ({ value: n, label: n.slice(org.length + 1) }))
  }, [q.data, menu.kind, org])

  const value = menu.kind === 'org' ? menu.org : menu.repo
  const current = options.some((o) => o.value === value)
    ? options
    : [
        {
          value,
          label: menu.kind === 'org' ? value : value.slice(org.length + 1),
        },
        ...options,
      ]

  return (
    <Select
      label={menu.kind === 'org' ? 'Switch organization' : 'Switch repository'}
      value={value}
      options={current}
      onChange={(v) =>
        navigate(
          menu.kind === 'org'
            ? { to: '/$org/$', params: { org: v, _splat: '' } }
            : repoLink(v, { kind: 'tree', path: '' }),
        )
      }
      className={className}
      trigger={trigger}
    />
  )
}
