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

export function Shortcut({ id, className }: { id: KeyId; className?: string }) {
  const [keys] = chordsOf(id)
  if (!keys) return null
  return <Keys keys={keys} className={className} />
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
