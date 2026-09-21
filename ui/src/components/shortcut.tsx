import { cn } from '@/lib/cn'
import { chordsOf, type KeyId } from '@/lib/keymap'

export function Keys({
  keys,
  className,
}: {
  keys: readonly string[]
  className?: string
}) {
  return (
    <span
      className={cn('inline-flex shrink-0 items-center gap-0.5', className)}
    >
      {keys.map((k) => (
        <kbd key={k} className="key">
          {k}
        </kbd>
      ))}
    </span>
  )
}

export function Shortcut({
  id,
  all = false,
  className,
}: {
  id: KeyId
  all?: boolean
  className?: string
}) {
  const chords = chordsOf(id)
  const shown = all ? chords : chords.slice(0, 1)
  return (
    <span
      className={cn('inline-flex shrink-0 items-center gap-1.5', className)}
    >
      {shown.map((keys, i) => (
        <span key={keys.join('+')} className="inline-flex items-center gap-1.5">
          {i > 0 && <span className="text-faint text-xs">or</span>}
          <Keys keys={keys} />
        </span>
      ))}
    </span>
  )
}

export function WithShortcut({
  label,
  id,
}: {
  label: React.ReactNode
  id?: KeyId
}) {
  if (!id) return <>{label}</>
  return (
    <span className="flex items-center gap-2">
      {label}
      <Shortcut id={id} />
    </span>
  )
}
