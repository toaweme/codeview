// repoParent is the name without its last segment, empty for a bare name.
export function repoParent(name: string): string {
  const i = name.lastIndexOf('/')
  return i < 0 ? '' : name.slice(0, i)
}

// repoBase is the last segment of a name.
export function repoBase(name: string): string {
  return name.slice(name.lastIndexOf('/') + 1)
}

// sharedHost is the first segment every name shares when it looks like a
// host, such as `github.com`, and empty otherwise.
export function sharedHost(names: readonly string[]): string {
  if (names.length === 0) return ''
  const first = names[0].split('/')[0]
  if (!first.includes('.')) return ''
  return names.every((n) => n.startsWith(`${first}/`)) ? first : ''
}

// RepoNames shortens full repository names and group paths for display.
// Routes and API calls keep the full name.
export type RepoNames = {
  host: string
  display: (name: string) => string
}

export function repoNames(names: readonly string[]): RepoNames {
  const host = sharedHost(names)
  return {
    host,
    display: (name) =>
      host && name.startsWith(`${host}/`) ? name.slice(host.length + 1) : name,
  }
}

export type RepoGroup<T> = { parent: string; repos: T[] }

// groupRepos sections repositories by parent path, keeping their order within
// a section. Sections sort by path, with the ones without a parent last.
export function groupRepos<T extends { name: string }>(
  repos: readonly T[],
): RepoGroup<T>[] {
  const by = new Map<string, T[]>()
  for (const r of repos) {
    const p = repoParent(r.name)
    const list = by.get(p)
    if (list) list.push(r)
    else by.set(p, [r])
  }
  return [...by]
    .map(([parent, list]) => ({ parent, repos: list }))
    .sort((a, b) =>
      !a.parent ? 1 : !b.parent ? -1 : a.parent.localeCompare(b.parent),
    )
}

// shiftPositions moves match positions on a full name onto a name shortened
// by `by` leading characters, dropping the ones that fell off.
export function shiftPositions(positions: readonly number[], by: number) {
  return by === 0
    ? [...positions]
    : positions.map((p) => p - by).filter((p) => p >= 0)
}
