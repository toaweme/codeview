import { noop } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { activityQuery, reposQuery } from '@/api/queries'
import { parseOverviewSearch } from '@/features/repos/overview-nav'
import { RepoList } from '@/features/repos/repo-list'

export const Route = createFileRoute('/')({
  validateSearch: parseOverviewSearch,
  loader: ({ context }) => {
    void context.queryClient.query(reposQuery()).catch(noop)
    void context.queryClient.query(activityQuery()).catch(noop)
  },
  component: () => <RepoList />,
})
