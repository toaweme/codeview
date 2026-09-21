import type { CSSProperties } from 'react'
import type { Tok } from '@/highlight'
import type { Range } from '@/lib/word-diff'
import { splitByRanges } from '@/lib/word-diff'

function tokStyle(t: Tok): CSSProperties | undefined {
  if (!t[1] && !t[2]) return undefined
  return { '--shiki-light': t[1], '--shiki-dark': t[2] } as CSSProperties
}

function styleClass(bits = 0): string {
  let c = 'tok'
  if (bits & 1) c += ' italic'
  if (bits & 2) c += ' font-semibold'
  if (bits & 4) c += ' underline'
  return c
}

export function LineContent({
  text,
  tokens,
  marks,
  markClass,
}: {
  text: string
  tokens?: Tok[]
  marks?: Range[]
  markClass?: string
}) {
  // length-capped lines fall back to plain text. Shiki drops a trailing \r from CRLF lines
  const sum = tokens ? tokens.reduce((n, t) => n + t[0].length, 0) : -1
  const toks =
    tokens &&
    (sum === text.length || (sum === text.length - 1 && text.endsWith('\r')))
      ? tokens
      : null

  if (marks && marks.length > 0) {
    const segs = splitByRanges<Tok>(
      toks ? toks.map((t) => ({ text: t[0], style: t })) : [{ text }],
      marks,
    )
    return (
      <>
        {segs.map((s, i) => {
          const cls = `${s.style ? styleClass(s.style[3]) : ''}${s.mark ? ` ${markClass ?? ''}` : ''}`
          return (
            <span
              // biome-ignore lint/suspicious/noArrayIndexKey: segments are positional and stable for a line
              key={i}
              className={cls || undefined}
              style={s.style ? tokStyle(s.style) : undefined}
            >
              {s.text}
            </span>
          )
        })}
      </>
    )
  }
  if (!toks) return <>{text}</>
  return (
    <>
      {toks.map((t, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: tokens are positional and stable for a line
        <span key={i} className={styleClass(t[3])} style={tokStyle(t)}>
          {t[0]}
        </span>
      ))}
    </>
  )
}
