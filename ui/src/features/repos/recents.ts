import { readJSON, writeJSON } from '@/lib/use-persisted-state'

export const RECENT_MAX = 5

const KEY = 'gv:recent-repos'

// pushRecent moves a name to the front, keeping at most `max` distinct names.
export function pushRecent(
  list: readonly string[],
  name: string,
  max = RECENT_MAX,
): string[] {
  return [name, ...list.filter((n) => n !== name)].slice(0, max)
}

// pruneRecents drops names the server no longer lists.
export function pruneRecents(
  list: readonly string[],
  known: ReadonlySet<string>,
): string[] {
  return list.filter((n) => known.has(n))
}

// loadRecents reads the stored list, tolerating missing or malformed storage.
export function loadRecents(): string[] {
  const v = readJSON<unknown>(KEY, [])
  return Array.isArray(v)
    ? v.filter((n): n is string => typeof n === 'string').slice(0, RECENT_MAX)
    : []
}

// recordRecent notes that a repository page was opened.
export function recordRecent(name: string) {
  writeJSON(KEY, pushRecent(loadRecents(), name))
}
