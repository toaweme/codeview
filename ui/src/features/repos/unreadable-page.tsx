import { useQuery } from '@tanstack/react-query'
import { reposQuery } from '@/api/queries'
import type { Repo } from '@/api/types'
import { AppShell } from '@/features/shell/app-shell'
import { Empty } from '@/features/shell/states'
import { RepoSidebar } from './repo-sidebar'

// UnreadablePage stands in for every view of a repository the server could not read,
// since each of them would only fail the same way.
export function UnreadablePage({ repo }: { repo: Repo }) {
  const q = useQuery(reposQuery())
  return (
    <AppShell
      section="repos"
      sidebar={<RepoSidebar repos={q.data?.repos ?? []} />}
    >
      <Empty
        title="This repository couldn't be read"
        description={`The server lists ${repo.name} but could not read its git data. Details are in the server log, and it shows up here again once the mirror is fixed.`}
        link={{ href: '/', label: 'All repositories' }}
      />
    </AppShell>
  )
}
