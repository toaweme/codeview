import { repoLink } from '@/lib/url'
import type { Release } from './versions'

// shortRepo names a repository relative to the group being viewed.
export function shortRepo(
  repo: string,
  org: string | undefined,
  display: (name: string) => string,
): string {
  return org && repo.startsWith(`${org}/`)
    ? repo.slice(org.length + 1)
    : display(repo)
}

export function releaseLink(r: Release) {
  return r.previous
    ? repoLink(r.repo, {
        kind: 'compare',
        base: r.previous,
        head: r.name,
      })
    : repoLink(r.repo, { kind: 'tree', ref: r.name, path: '' })
}
