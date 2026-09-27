import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { ChevronsUpDown } from 'lucide-react'
import { useMemo } from 'react'
import { reposQuery } from '@/api/queries'
import { Select } from '@/components/select'
import { useRepoNames } from '@/features/repos/use-repo-names'
import { repoBase, repoParent } from '@/lib/repo-name'
import { groupLink, repoLink } from '@/lib/url'

export type CrumbMenu =
  | { kind: 'org'; org: string }
  | { kind: 'repo'; repo: string }

// CrumbSwitch is the icon button after a crumb name that switches to a sibling
// group or repository.
export function CrumbSwitch({ menu }: { menu: CrumbMenu }) {
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

  const label = menu.kind === 'org' ? 'Switch group' : 'Switch repository'
  return (
    <Select
      label={label}
      value={value}
      options={current}
      onChange={(v) =>
        navigate(
          menu.kind === 'org'
            ? groupLink(v)
            : repoLink(v, { kind: 'tree', path: '' }),
        )
      }
      className="shrink-0"
      trigger="size-6 justify-center rounded-md text-faint hover:bg-hover hover:text-foreground data-[state=open]:bg-hover data-[state=open]:text-foreground"
      content={<ChevronsUpDown className="size-3.5" aria-hidden />}
      tooltip={label}
    />
  )
}
