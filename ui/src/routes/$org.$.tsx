import { noop } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { reposQuery } from '@/api/queries'
import { RepoPage } from '@/features/repo/repo-page'
import { RepoList } from '@/features/repos/repo-list'
import { parseRepoPath } from '@/lib/url'

export const Route = createFileRoute('/$org/$')({
  loader: ({ context: { queryClient: qc } }) => {
    void qc.query(reposQuery()).catch(noop)
  },
  component: RepoRoute,
})

function RepoRoute() {
  const { org, _splat } = Route.useParams()
  const loc = parseRepoPath(org, _splat)
  if (!loc) return <RepoList org={org} />
  return <RepoPage loc={loc} />
}
