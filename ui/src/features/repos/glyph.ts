import { repoBase } from '@/lib/repo-name'

// monogram takes the initials of the first two words of a repository's base
// name, or the first two characters when the name is a single word. Words
// split on anything that is not a letter or digit and on camelCase humps.
export function monogram(name: string): string {
  const words = repoBase(name)
    .replace(/\.git$/i, '')
    .replace(/(\p{Ll}|\p{N})(\p{Lu})/gu, '$1 $2')
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
  if (words.length === 0) return '?'
  if (words.length === 1)
    return [...words[0]].slice(0, 2).join('').toUpperCase()
  return ([...words[0]][0] + [...words[1]][0]).toUpperCase()
}
