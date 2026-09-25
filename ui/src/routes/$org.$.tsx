import { noop } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import {
  activityQuery,
  blameQuery,
  blobQuery,
  commitQuery,
  compareQuery,
  logQuery,
  refsQuery,
  repoActivityQuery,
  reposQuery,
  resolveRef,
  treeQuery,
} from '@/api/queries'
import { apiParams, parseHistoryFilter } from '@/features/commits/filters'
import { RepoPage } from '@/features/repo/repo-page'
import { parseOverviewSearch } from '@/features/repos/overview-nav'
import { RepoList } from '@/features/repos/repo-list'
import { parseRepoPath, parseRepoSearch } from '@/lib/url'

export const Route = createFileRoute('/$org/$')({
  validateSearch: (search: Record<string, unknown>) => ({
    ...parseRepoSearch(search),
    ...parseHistoryFilter(search),
    ...parseOverviewSearch(search),
  }),
  loaderDeps: ({ search }) => ({
    mode: search.mode,
    history: parseHistoryFilter(search),
  }),
  loader: async ({ context: { queryClient: qc }, params, deps }) => {
    const loc = parseRepoPath(params.org, params._splat)
    if (!loc) {
      void qc.query(reposQuery()).catch(noop)
      void qc.query(activityQuery(params.org)).catch(noop)
      return
    }
    const { repo, view } = loc
    if (view.kind === 'commit') {
      void qc.query(commitQuery(repo, view.hash)).catch(noop)
      return
    }
    if (view.kind === 'branches') {
      void qc.query(repoActivityQuery(repo)).catch(noop)
      return
    }
    if (view.kind === 'releases') {
      void qc.query(refsQuery(repo)).catch(noop)
      return
    }
    if (view.kind === 'compare') {
      if (view.base && view.head)
        void qc
          .query(compareQuery(repo, view.base, view.head, deps.mode))
          .catch(noop)
      return
    }
    const refs = await qc
      .query({ ...refsQuery(repo), staleTime: 'static' })
      .catch(() => undefined)
    const rev = resolveRef(refs, view.ref)?.rev
    if (!rev) return
    switch (view.kind) {
      case 'tree':
        void qc.query(treeQuery(repo, rev, view.path)).catch(noop)
        break
      case 'blob':
        void qc.query(blobQuery(repo, rev, view.path)).catch(noop)
        break
      case 'blame':
        void qc.query(blobQuery(repo, rev, view.path)).catch(noop)
        void qc.query(blameQuery(repo, rev, view.path)).catch(noop)
        break
      case 'commits':
        void qc
          .infiniteQuery(
            logQuery(repo, rev, view.path, apiParams(deps.history, new Date())),
          )
          .catch(noop)
        break
    }
  },
  component: RepoRoute,
})

function RepoRoute() {
  const { org, _splat } = Route.useParams()
  const { mode } = Route.useSearch()
  const loc = parseRepoPath(org, _splat)
  if (!loc) return <RepoList org={org} />
  if (loc.view.kind === 'compare' && mode) loc.view.mode = mode
  return <RepoPage loc={loc} />
}
