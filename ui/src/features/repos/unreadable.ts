import type { Repo } from '@/api/types'

export const UNREADABLE = "Couldn't be read"

// unreadableTitle explains a repository the server listed without reading it,
// and is undefined for every readable one.
export function unreadableTitle(
  repo: Pick<Repo, 'name' | 'error'>,
): string | undefined {
  if (!repo.error) return undefined
  return `${repo.name} couldn't be read. Details are in the server log.`
}

// failedSummary counts skipped repositories in one line however many there are.
export function failedSummary(count: number): string {
  return count === 1
    ? "1 repository couldn't be read"
    : `${count.toLocaleString()} repositories couldn't be read`
}

// allUnreadable reports a feed whose every repository in scope failed,
// so an empty result says the repositories are broken rather than quiet.
export function allUnreadable(failed: number, inScope: number): boolean {
  return failed > 0 && failed >= inScope
}
