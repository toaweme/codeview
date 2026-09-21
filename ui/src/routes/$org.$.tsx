import { noop } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { reposQuery } from '@/api/queries'
import { RepoList } from '@/features/repos/repo-list'

export const Route = createFileRoute('/$org/$')({
  loader: ({ context: { queryClient: qc } }) => {
    void qc.query(reposQuery()).catch(noop)
  },
  component: RepoRoute,
})

function RepoRoute() {
  const { org } = Route.useParams()
  return <RepoList org={org} />
}
