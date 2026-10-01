import { repoBase, repoParent } from './repo-name'
import type { RepoLocation } from './url'

const APP = 'Codeview'

function join(...parts: string[]): string {
  return parts.filter(Boolean).join(' - ')
}

function full(page: string): string {
  return join(page, APP)
}

function lastSegment(path: string): string {
  const segs = path.split('/').filter(Boolean)
  return segs[segs.length - 1] ?? ''
}

export type TitleExtra = {
  // subject is the commit subject once it has loaded
  subject?: string
  // tab is the label of a non-default tab kept in the query string
  tab?: string
}

// pageTitle names a page most specific part first, so many open tabs stay
// apart. path is the URL path below the root and loc its parsed repository.
export function pageTitle(
  path: string,
  loc: RepoLocation | null,
  extra: TitleExtra = {},
): string {
  return full(page(path, loc, extra))
}

function page(
  path: string,
  loc: RepoLocation | null,
  { subject, tab }: TitleExtra,
): string {
  if (!loc) return join(tab ?? '', path ? lastSegment(path) : '') || 'Dashboard'
  const base = repoBase(loc.repo)
  const view = loc.view
  switch (view.kind) {
    case 'tree':
      return view.path
        ? join(`${lastSegment(view.path)}/`, base)
        : join(base, lastSegment(repoParent(loc.repo)))
    case 'blob':
    case 'blame':
      return join(lastSegment(view.path), base)
    case 'commits':
      return join('Commits', base)
    case 'commit':
      return join(
        [view.hash.slice(0, 7), subject].filter(Boolean).join(' '),
        base,
      )
    case 'compare':
      return view.base && view.head
        ? join(
            `${view.base}${view.mode === 'direct' ? '..' : '...'}${view.head}`,
            base,
          )
        : join('Compare', base)
    case 'branches':
      return join('Branches', base)
    case 'releases':
      return join('Releases', base)
  }
}

export const NOT_FOUND_TITLE = full('Not found')
