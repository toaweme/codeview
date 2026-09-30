import { useMemo } from 'react'
import type { Blame } from '@/api/types'
import { Avatar } from '@/components/avatar'
import { Badge } from '@/components/badge'
import { Tooltip } from '@/components/tooltip'
import { AGE_STEPS } from '@/lib/time'

const MAX_AVATARS = 5

type Contributor = { key: string; name: string; email: string; lines: number }

function contributors(blame: Blame): Contributor[] {
  const by = new Map<string, Contributor>()
  for (const r of blame.ranges) {
    const { name, email } = r.commit.author
    const key = (email || name).toLowerCase()
    const c = by.get(key) ?? { key, name, email, lines: 0 }
    c.lines += r.end - r.start + 1
    by.set(key, c)
  }
  return [...by.values()].sort((a, b) => b.lines - a.lines)
}

export function authorLabel(a: { name: string; email: string }): string {
  return a.email ? `${a.name} <${a.email}>` : a.name
}

export function BlameLegend({ blame }: { blame?: Blame }) {
  const people = useMemo(() => (blame ? contributors(blame) : []), [blame])
  return (
    <div className="flex h-11 shrink-0 items-center justify-between gap-3 overflow-hidden px-3 text-faint text-sm sm:gap-6 sm:px-6">
      <div className="flex items-center gap-3">
        <span>Older</span>
        <span className="flex items-center gap-0.5" aria-hidden>
          {Array.from({ length: AGE_STEPS }, (_, i) => (
            <span
              // biome-ignore lint/suspicious/noArrayIndexKey: fixed color steps
              key={i}
              className="size-2.5 rounded-[2px]"
              style={{ backgroundColor: `var(--age-${i + 1})` }}
            />
          ))}
        </span>
        <span>Newer</span>
      </div>
      {people.length > 0 && (
        <div className="flex items-center gap-3">
          <span className="flex items-center">
            {people.slice(0, MAX_AVATARS).map((p, i) => (
              <Tooltip key={p.key} label={authorLabel(p)} side="bottom">
                <Avatar
                  name={p.name}
                  className="ring-2 ring-background"
                  style={{
                    marginLeft: i === 0 ? 0 : -8,
                    zIndex: MAX_AVATARS - i,
                  }}
                />
              </Tooltip>
            ))}
          </span>
          <span className="flex items-center gap-2">
            <span className="max-sm:hidden">Contributors</span>
            <Badge>{people.length.toLocaleString()}</Badge>
          </span>
        </div>
      )}
    </div>
  )
}
