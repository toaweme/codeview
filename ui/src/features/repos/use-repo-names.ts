import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { reposQuery } from '@/api/queries'
import { type RepoNames, repoNames } from '@/lib/repo-name'

export function useRepoNames(): RepoNames {
  const data = useQuery(reposQuery()).data
  return useMemo(() => repoNames(data?.repos.map((r) => r.name) ?? []), [data])
}
