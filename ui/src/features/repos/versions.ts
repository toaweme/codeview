const VERSION = /^(?:(.+)\/)?(v?\d+(?:\.\d+){1,3}(?:[-+][0-9A-Za-z.+-]+)?)$/

export type TagName = {
  prefix: string
  version: string
  isVersion: boolean
}

export function splitTag(name: string): TagName {
  const m = VERSION.exec(name)
  if (!m) return { prefix: '', version: name, isVersion: false }
  return { prefix: m[1] ?? '', version: m[2], isVersion: true }
}

export function compareVersions(a: string, b: string): number {
  const parse = (v: string) => {
    const [core, ...rest] = v.replace(/^v/, '').split(/[-+]/)
    return { nums: core.split('.').map(Number), pre: rest.length > 0 }
  }
  const x = parse(a)
  const y = parse(b)
  for (let i = 0; i < Math.max(x.nums.length, y.nums.length); i++) {
    const d = (y.nums[i] ?? 0) - (x.nums[i] ?? 0)
    if (d !== 0) return d
  }
  return Number(x.pre) - Number(y.pre)
}

export type Release = {
  repo: string
  name: string
  commit: string
  taggedAt: string
  prefix: string
  version: string
  isVersion: boolean
  previous: string
}

// each tag diffs against the previous release under the same module path
export function buildReleases(
  repo: string,
  tags: { name: string; commit: string; updated_at: string }[],
): Release[] {
  const list = tags.map((t) => ({
    repo,
    name: t.name,
    commit: t.commit,
    taggedAt: t.updated_at,
    previous: '',
    ...splitTag(t.name),
  }))
  list.sort((a, b) => {
    const d = Date.parse(b.taggedAt) - Date.parse(a.taggedAt)
    if (d !== 0) return d
    if (a.isVersion && b.isVersion && a.prefix === b.prefix)
      return compareVersions(a.version, b.version)
    return a.name.localeCompare(b.name)
  })
  const older = new Map<string, Release>()
  for (let i = list.length - 1; i >= 0; i--) {
    const r = list[i]
    const track = r.isVersion ? `v:${r.prefix}` : 'other'
    r.previous = older.get(track)?.name ?? ''
    older.set(track, r)
  }
  return list
}

export function monthKey(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

const monthFmt = new Intl.DateTimeFormat('en', {
  year: 'numeric',
  month: 'long',
})

export function formatMonth(iso: string): string {
  const t = Date.parse(iso)
  return Number.isNaN(t) ? '' : monthFmt.format(t)
}

export type ReleaseGroup = { key: string; title: string; releases: Release[] }

// releases keep their order within each group
export function groupReleases(
  releases: readonly Release[],
  key: (r: Release) => string,
  title: (r: Release) => string,
): ReleaseGroup[] {
  const out: ReleaseGroup[] = []
  const byKey = new Map<string, ReleaseGroup>()
  for (const r of releases) {
    const k = key(r)
    let g = byKey.get(k)
    if (!g) {
      g = { key: k, title: title(r), releases: [] }
      byKey.set(k, g)
      out.push(g)
    }
    g.releases.push(r)
  }
  return out
}

export const byMonth = [
  (r: Release) => monthKey(r.taggedAt),
  (r: Release) => formatMonth(r.taggedAt),
] as const

export function isBotBranch(name: string): boolean {
  return /^(dependabot|renovate|copilot)\//.test(name)
}
