export type Option<T extends string = string> = {
  value: T
  label: string
  secondary?: string
  keywords?: string[]
  group?: string
}

export const optionId = (listId: string, i: number) => `${listId}-${i}`

export function filterOptions<O extends Option>(
  options: readonly O[],
  query: string,
): O[] {
  const q = query.trim().toLowerCase()
  if (!q) return [...options]
  const words = q.split(/\s+/)
  const head: O[] = []
  const rest: O[] = []
  for (const o of options) {
    const hay = [o.label, o.secondary ?? '', ...(o.keywords ?? [])]
      .join('\n')
      .toLowerCase()
    if (!words.every((w) => hay.includes(w))) continue
    if (o.label.toLowerCase().startsWith(q)) head.push(o)
    else rest.push(o)
  }
  return [...head, ...rest]
}

export type NavAction =
  | { type: 'next' }
  | { type: 'prev' }
  | { type: 'first' }
  | { type: 'last' }
  | { type: 'set'; index: number }
  | { type: 'reset'; index?: number }

// -1 means no row is active. moves stop at the ends so a held arrow never spins
export function navigate(
  active: number,
  action: NavAction,
  count: number,
): number {
  if (count <= 0) return -1
  switch (action.type) {
    case 'next':
      return active < 0 ? 0 : Math.min(active + 1, count - 1)
    case 'prev':
      return active < 0 ? count - 1 : Math.max(active - 1, 0)
    case 'first':
      return 0
    case 'last':
      return count - 1
    case 'set':
      return Math.max(-1, Math.min(action.index, count - 1))
    case 'reset':
      return Math.max(-1, Math.min(action.index ?? -1, count - 1))
  }
}

export function typeahead(
  labels: readonly string[],
  prefix: string,
  active: number,
): number {
  const p = prefix.toLowerCase()
  if (!p || labels.length === 0) return active
  const cycling = p.length > 1 && [...p].every((c) => c === p[0])
  const needle = cycling ? p[0] : p
  const start = cycling || p.length === 1 ? active + 1 : Math.max(active, 0)
  for (let i = 0; i < labels.length; i++) {
    const at = (start + i) % labels.length
    if (labels[at].toLowerCase().startsWith(needle)) return at
  }
  return active
}

export function navKey(key: string): NavAction | null {
  switch (key) {
    case 'ArrowDown':
      return { type: 'next' }
    case 'ArrowUp':
      return { type: 'prev' }
    case 'Home':
      return { type: 'first' }
    case 'End':
      return { type: 'last' }
    default:
      return null
  }
}

export function toggleValue(
  selected: readonly string[],
  value: string,
): string[] {
  return selected.includes(value)
    ? selected.filter((v) => v !== value)
    : [...selected, value]
}

export function selectAll(
  selected: readonly string[],
  shown: readonly Option[],
): string[] {
  const out = [...selected]
  for (const o of shown) if (!out.includes(o.value)) out.push(o.value)
  return out
}

export function multiLabel(
  selected: readonly string[],
  options: readonly Option[],
  all: string,
  count: (n: number) => string,
): string {
  const known = options.filter((o) => selected.includes(o.value))
  if (known.length === 0 || known.length === options.length) return all
  if (known.length === 1) return known[0].label
  return count(known.length)
}

export type GroupedRow<O> =
  | { kind: 'head'; label: string }
  | { kind: 'row'; option: O; index: number }

// a row's index counts rows only, not headings, as keyboard navigation does
export function groupRows<O extends Option>(
  options: readonly O[],
): { rows: GroupedRow<O>[]; order: O[] } {
  if (!options.some((o) => o.group)) {
    return {
      rows: options.map((option, index) => ({ kind: 'row', option, index })),
      order: [...options],
    }
  }
  const groups = new Map<string, O[]>()
  for (const o of options) {
    const g = o.group ?? ''
    const list = groups.get(g)
    if (list) list.push(o)
    else groups.set(g, [o])
  }
  const rows: GroupedRow<O>[] = []
  const order: O[] = []
  for (const [label, list] of groups) {
    if (label) rows.push({ kind: 'head', label })
    for (const option of list) {
      rows.push({ kind: 'row', option, index: order.length })
      order.push(option)
    }
  }
  return { rows, order }
}
