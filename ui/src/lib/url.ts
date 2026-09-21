// a URL ref is one path segment, so `/` is encoded as `~` and a literal `~`
// (only a revision suffix like `main~3`, git forbids it in names) as `~~`

export type RepoView =
  | { kind: 'tree'; ref?: string; path: string }
  | { kind: 'blob'; ref?: string; path: string }
  | { kind: 'blame'; ref?: string; path: string }
  | { kind: 'commits'; ref?: string; path: string }
  | { kind: 'commit'; hash: string }
  | { kind: 'compare'; base: string; head: string; mode?: CompareMode }
  | { kind: 'branches' }
  | { kind: 'releases' }

export type CompareMode = 'direct'

export type RepoSearch = { mode?: CompareMode }

export function parseRepoSearch(search: Record<string, unknown>): RepoSearch {
  return search.mode === 'direct' ? { mode: 'direct' } : {}
}

export type RepoLocation = {
  repo: string
  view: RepoView
}

export function encodeRef(ref: string): string {
  return ref.replace(/~/g, '~~').replace(/\//g, '~')
}

export function decodeRef(enc: string): string {
  return enc.replace(/~~|~/g, (m) => (m === '~' ? '/' : '~'))
}

function splitAt(seg: string): [string, string | undefined] {
  const i = seg.indexOf('@')
  if (i < 0) return [seg, undefined]
  const ref = seg.slice(i + 1)
  return [seg.slice(0, i), ref ? decodeRef(ref) : undefined]
}

export function parseRepoPath(
  org: string,
  splat: string | undefined,
): RepoLocation | null {
  const segs = (splat ?? '').split('/').filter(Boolean)
  if (segs.length === 0) return null
  const [name, ref] = splitAt(segs[0])
  const repo = `${org}/${name}`
  const [action, actionRef] = segs.length > 1 ? splitAt(segs[1]) : ['', '']
  const rest = segs.slice(2).join('/')

  switch (action) {
    case 'tree':
    case 'blob':
    case 'blame':
      return { repo, view: { kind: action, ref, path: rest } }
    case 'commits':
      return {
        repo,
        view: { kind: 'commits', ref: actionRef ?? ref, path: rest },
      }
    case 'commit':
      return { repo, view: { kind: 'commit', hash: segs[2] ?? '' } }
    case 'branches':
    case 'releases':
      return { repo, view: { kind: action } }
    case 'compare': {
      const spec = segs.slice(2).join('/')
      const i = spec.indexOf('...')
      const base = i < 0 ? spec : spec.slice(0, i)
      const head = i < 0 ? '' : spec.slice(i + 3)
      return {
        repo,
        view: { kind: 'compare', base: decodeRef(base), head: decodeRef(head) },
      }
    }
    default:
      return { repo, view: { kind: 'tree', ref, path: '' } }
  }
}

function withRef(name: string, ref?: string): string {
  return ref ? `${name}@${encodeRef(ref)}` : name
}

function joinPath(...parts: string[]): string {
  return parts.filter(Boolean).join('/')
}

export function repoSplat(repo: string, view: RepoView): string {
  const name = repo.slice(repo.indexOf('/') + 1)
  switch (view.kind) {
    case 'tree':
      if (!view.path) return withRef(name, view.ref)
      return joinPath(withRef(name, view.ref), 'tree', view.path)
    case 'blob':
    case 'blame':
      return joinPath(withRef(name, view.ref), view.kind, view.path)
    case 'commits':
      return joinPath(name, withRef('commits', view.ref), view.path)
    case 'commit':
      return joinPath(name, 'commit', view.hash)
    case 'branches':
    case 'releases':
      return joinPath(name, view.kind)
    case 'compare':
      return joinPath(
        name,
        'compare',
        `${encodeRef(view.base)}...${encodeRef(view.head)}`,
      )
  }
}

export function repoOrg(repo: string): string {
  const i = repo.indexOf('/')
  return i < 0 ? repo : repo.slice(0, i)
}

export function repoLink(
  repo: string,
  view: RepoView,
): {
  to: '/$org/$'
  params: { org: string; _splat: string }
  search: RepoSearch
} {
  return {
    to: '/$org/$',
    params: { org: repoOrg(repo), _splat: repoSplat(repo, view) },
    search: view.kind === 'compare' && view.mode ? { mode: view.mode } : {},
  }
}

export function repoHref(repo: string, view: RepoView): string {
  const path = `/${repoOrg(repo)}/${repoSplat(repo, view)}`
    .split('/')
    .map((s) => encodeURIComponent(s).replace(/%40/g, '@'))
    .join('/')
  return view.kind === 'compare' && view.mode
    ? `${path}?mode=${view.mode}`
    : path
}

// repoPermalink swaps the ref in href for commit on views that carry one,
// keeping the query and line hash, and returns href unchanged otherwise.
export function repoPermalink(
  href: string,
  repo: string,
  view: RepoView,
  commit?: string,
): string {
  if (!commit || !('path' in view)) return href
  const u = new URL(href)
  u.pathname = repoHref(repo, { ...view, ref: commit })
  return u.toString()
}

export type Selection = { start: number; end: number }

export function parseLineHash(hash: string): Selection | null {
  const m = /^#?L(\d+)(?:-L?(\d+))?$/.exec(hash)
  if (!m) return null
  const a = Number(m[1])
  const b = m[2] ? Number(m[2]) : a
  if (a < 1 || b < 1) return null
  return { start: Math.min(a, b), end: Math.max(a, b) }
}

export function formatLineHash(sel: Selection | null): string {
  if (!sel) return ''
  return sel.start === sel.end ? `L${sel.start}` : `L${sel.start}-L${sel.end}`
}

export function isCommitHash(ref: string): boolean {
  return /^[0-9a-f]{7,64}$/.test(ref)
}

export function splitRevision(rev: string): { name: string; suffix: string } {
  const m = /^([^~^\s:?*[\\]+?)((?:[~^]\d{0,6})+)$/.exec(rev)
  if (!m || m[1].startsWith('-') || m[1].includes('..'))
    return { name: rev, suffix: '' }
  return { name: m[1], suffix: m[2] }
}

export function isRevision(rev: string): boolean {
  return splitRevision(rev).suffix !== ''
}
