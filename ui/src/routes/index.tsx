import { noop } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { reposQuery } from '@/api/queries'
import { RepoList } from '@/features/repos/repo-list'

export const Route = createFileRoute('/')({
  loader: ({ context }) => {
    void context.queryClient.query(reposQuery()).catch(noop)
  },
  component: () => <RepoList />,
})
