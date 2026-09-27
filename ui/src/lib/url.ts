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

const ACTIONS = new Set([
  'tree',
  'blob',
  'blame',
  'commits',
  'commit',
  'compare',
  'branches',
  'releases',
])

// repoEnd finds how many leading segments name the repository. A name of
// known repositories wins, the longest one first, so `seed/chi` beats `seed`.
// Without a match the name ends before the first action or at the first ref.
function repoEnd(segs: string[], known?: ReadonlySet<string>): number {
  if (known) {
    for (let i = segs.length; i > 0; i--) {
      const name = [...segs.slice(0, i - 1), splitAt(segs[i - 1])[0]].join('/')
      if (known.has(name)) return i
    }
  }
  for (const [i, seg] of segs.entries()) {
    if (i > 0 && ACTIONS.has(splitAt(seg)[0])) return i
    if (seg.includes('@')) return i + 1
  }
  return 0
}

// parseRepoPath reads a URL path such as `github.com/o/r@main/blob/a.go`.
// It returns null when the path names no repository, which makes it a group.
export function parseRepoPath(
  path: string,
  known?: ReadonlySet<string>,
): RepoLocation | null {
  const all = path.split('/').filter(Boolean)
  const end = repoEnd(all, known)
  if (end === 0) return null
  const [last, ref] = splitAt(all[end - 1])
  const repo = [...all.slice(0, end - 1), last].join('/')
  const segs = all.slice(end)
  const [action, actionRef] = segs.length > 0 ? splitAt(segs[0]) : ['', '']
  const rest = segs.slice(1).join('/')

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
      return { repo, view: { kind: 'commit', hash: segs[1] ?? '' } }
    case 'branches':
    case 'releases':
      return { repo, view: { kind: action } }
    case 'compare': {
      const i = rest.indexOf('...')
      const base = i < 0 ? rest : rest.slice(0, i)
      const head = i < 0 ? '' : rest.slice(i + 3)
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

// repoPath is the URL path of a view, without the leading slash.
export function repoPath(repo: string, view: RepoView): string {
  switch (view.kind) {
    case 'tree':
      if (!view.path) return withRef(repo, view.ref)
      return joinPath(withRef(repo, view.ref), 'tree', view.path)
    case 'blob':
    case 'blame':
      return joinPath(withRef(repo, view.ref), view.kind, view.path)
    case 'commits':
      return joinPath(repo, withRef('commits', view.ref), view.path)
    case 'commit':
      return joinPath(repo, 'commit', view.hash)
    case 'branches':
    case 'releases':
      return joinPath(repo, view.kind)
    case 'compare':
      return joinPath(
        repo,
        'compare',
        `${encodeRef(view.base)}...${encodeRef(view.head)}`,
      )
  }
}

// splitLink turns a URL path into the params of the `/$org/$` route.
function splitLink(path: string): { org: string; _splat: string } {
  const i = path.indexOf('/')
  return i < 0
    ? { org: path, _splat: '' }
    : { org: path.slice(0, i), _splat: path.slice(i + 1) }
}

// groupLink lists the repositories under a parent path.
export function groupLink(group: string) {
  return { to: '/$org/$' as const, params: splitLink(group) }
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
    params: splitLink(repoPath(repo, view)),
    search: view.kind === 'compare' && view.mode ? { mode: view.mode } : {},
  }
}

export function repoHref(repo: string, view: RepoView): string {
  const path = `/${repoPath(repo, view)}`
    .split('/')
    .map((s) => encodeURIComponent(s).replace(/%40/g, '@'))
    .join('/')
  return view.kind === 'compare' && view.mode
    ? `${path}?mode=${view.mode}`
    : path
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
