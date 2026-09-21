import { queryOptions } from '@tanstack/react-query'
import { getJSON } from './client'
import type { RepoList } from './types'

export const reposQuery = () =>
  queryOptions({
    queryKey: ['repos'],
    queryFn: ({ signal }) => getJSON<RepoList>('repos', {}, signal),
    staleTime: 60_000,
  })
