import type { Refs } from '@/api/types'
import { relativeTime } from '@/lib/time'

export type Mode = 'since' | 'direct'

export function middleTruncate(s: string, max: number): string {
  if (s.length <= max) return s
  const head = Math.ceil((max - 1) / 2)
  const tail = max - 1 - head
  return `${s.slice(0, head)}…${s.slice(s.length - tail)}`
}

export type Preset = {
  key: string
  from: string
  to: string
  title: string
}

const BOT_PREFIXES = ['dependabot/', 'renovate/', 'copilot/']
const isBot = (name: string) => BOT_PREFIXES.some((p) => name.startsWith(p))

const MAX_PRESETS = 4

export function buildPresets(refs?: Refs): Preset[] {
  if (!refs) return []
  const byTime = <T extends { updated_at: string }>(xs: T[]) =>
    [...xs].sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at))
  const tags = byTime(refs.tags)
  const out: Preset[] = []
  if (tags[0] && refs.default)
    out.push({
      key: 'latest-default',
      from: tags[0].name,
      to: refs.default,
      title: `Unreleased work on ${refs.default} since ${tags[0].name}`,
    })
  if (tags[1])
    out.push({
      key: 'previous-latest',
      from: tags[1].name,
      to: tags[0].name,
      title: `Everything in the ${tags[0].name} release`,
    })
  const branches = byTime(
    refs.branches.filter((b) => b.name !== refs.default),
  ).sort((a, b) => Number(isBot(a.name)) - Number(isBot(b.name)))
  for (const b of branches.slice(0, MAX_PRESETS - out.length))
    out.push({
      key: `branch-${b.name}`,
      from: refs.default,
      to: b.name,
      title: `What ${b.name} adds, updated ${relativeTime(b.updated_at)}`,
    })
  return out
}
