import { noop } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { activityQuery, reposQuery } from '@/api/queries'
import { overviewTab, parseOverviewSearch } from '@/features/repos/overview-nav'
import { RepoList } from '@/features/repos/repo-list'
import { pageTitle } from '@/lib/title'
import { useTitle } from '@/lib/use-title'

export const Route = createFileRoute('/')({
  validateSearch: parseOverviewSearch,
  loader: ({ context }) => {
    void context.queryClient.query(reposQuery()).catch(noop)
    void context.queryClient.query(activityQuery()).catch(noop)
  },
  component: Index,
})

function Index() {
  useTitle(pageTitle('', null, { tab: overviewTab(Route.useSearch()) }))
  return <RepoList />
}
