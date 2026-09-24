import { useNavigate, useSearch } from '@tanstack/react-router'
import { useMemo } from 'react'
import { formatRepoFilter, parseRepoFilter } from './overview-nav'

export function useRepoFilter() {
  const raw = useSearch({ strict: false }).repos
  const picked = useMemo(() => parseRepoFilter(raw), [raw])
  const navigate = useNavigate()
  const setPicked = (next: readonly string[]) =>
    void navigate({
      to: '.',
      search: (prev) => ({ ...prev, repos: formatRepoFilter(next) }),
      replace: true,
      resetScroll: false,
    })
  return [picked, setPicked] as const
}
