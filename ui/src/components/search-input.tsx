import { Search, X } from 'lucide-react'
import { cn } from '@/lib/cn'
import { escapeAction } from '@/lib/search'

export function SearchInput({
  value,
  onChange,
  placeholder,
  onKeyDown,
  className,
  label,
}: {
  value: string
  onChange: (value: string) => void
  placeholder: string
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void
  className?: string
  label?: string
}) {
  return (
    <div
      className={cn(
        'relative flex h-9 pointer-coarse:h-10 items-center rounded-lg bg-island-muted',
        'text-faint transition-colors duration-100',
        'focus-within:ring-2 focus-within:ring-ring/40 hover:text-muted-foreground',
        className,
      )}
    >
      <Search
        className="pointer-events-none absolute left-2.5 size-4 shrink-0"
        aria-hidden
      />
      <input
        value={value}
        aria-label={label ?? placeholder}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault()
            e.stopPropagation()
            if (escapeAction(value) === 'clear') onChange('')
            else e.currentTarget.blur()
            return
          }
          onKeyDown?.(e)
        }}
        placeholder={placeholder}
        className="h-full min-w-0 flex-1 bg-transparent pr-9 pl-9 text-foreground outline-none placeholder:text-faint"
      />
      {value && (
        <button
          type="button"
          aria-label="Clear"
          onClick={() => onChange('')}
          className={cn(
            'absolute right-1.5 grid size-6 place-items-center rounded-md',
            'text-faint transition-colors duration-100',
            'hover:bg-hover hover:text-foreground',
          )}
        >
          <X className="size-3.5" aria-hidden />
        </button>
      )}
    </div>
  )
}
