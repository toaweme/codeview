import { cn } from '@/lib/cn'
import { repoParent } from '@/lib/repo-name'
import { monogram } from './glyph'
import { orgColor } from './sidebar-rank'

const SIZES = {
  sm: 'size-5 rounded-md text-[9px]',
  row: 'size-7 rounded-lg text-[11px]',
  md: 'size-9 rounded-xl text-[13px]',
} as const

// RepoGlyph is a monogram tile tinted with the colour of the repository's org.
export function RepoGlyph({
  name,
  size = 'md',
  className,
}: {
  name: string
  size?: keyof typeof SIZES
  className?: string
}) {
  return (
    <span
      aria-hidden
      style={{ '--tone': orgColor(repoParent(name)) } as React.CSSProperties}
      className={cn(
        'grid shrink-0 select-none place-items-center font-semibold leading-none tracking-tight',
        'bg-[color-mix(in_oklab,var(--tone)_16%,transparent)] text-(--tone)',
        SIZES[size],
        className,
      )}
    >
      {monogram(name)}
    </span>
  )
}
