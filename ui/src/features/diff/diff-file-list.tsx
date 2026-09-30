import { Check } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { FileDiff } from '@/api/types'
import { SearchInput } from '@/components/search-input'
import { cn } from '@/lib/cn'
import { StatusBadge } from './status'

export function DiffFileList({
  files,
  current,
  viewed,
  onSelect,
  onToggleViewed,
}: {
  files: FileDiff[]
  current: number
  viewed: ReadonlySet<string>
  onSelect: (file: number) => void
  onToggleViewed: (file: number) => void
}) {
  const [filter, setFilter] = useState('')
  const listRef = useRef<HTMLUListElement>(null)
  const shown = useMemo(() => {
    const f = filter.toLowerCase()
    return files
      .map((file, i) => ({ file, i }))
      .filter(({ file }) => !f || file.path.toLowerCase().includes(f))
  }, [files, filter])

  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-file="${current}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  }, [current])

  return (
    <>
      <div className="shrink-0 px-2 pb-2">
        <SearchInput
          value={filter}
          onChange={setFilter}
          placeholder={`Filter ${files.length} changed ${files.length === 1 ? 'file' : 'files'}`}
        />
      </div>
      <ul ref={listRef} className="min-h-0 flex-1 overflow-auto px-2 pb-3">
        {shown.map(({ file: f, i }) => {
          const slash = f.path.lastIndexOf('/')
          const dir = slash >= 0 ? f.path.slice(0, slash + 1) : ''
          const name = f.path.slice(slash + 1)
          const isViewed = viewed.has(f.path)
          return (
            <li
              key={f.path + i}
              data-file={i}
              className={cn(
                'group flex items-center rounded-lg',
                'h-(--row-h) gap-2 pr-2 pl-2',
                'transition-colors duration-75',
                i === current ? 'bg-active' : 'hover:bg-hover',
              )}
            >
              <button
                type="button"
                onClick={() => onSelect(i)}
                title={f.path}
                className={cn(
                  'flex h-full min-w-0 flex-1 items-center gap-2.5 text-left text-base',
                  isViewed && 'opacity-50',
                )}
              >
                <StatusBadge status={f.status} short />
                <span className="min-w-0 flex-1 truncate" dir="rtl">
                  <span dir="ltr">
                    <span className="text-faint">{dir}</span>
                    <span className="text-foreground">{name}</span>
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-1.5 text-xs num">
                  {f.additions > 0 && (
                    <span className="text-add">+{f.additions}</span>
                  )}
                  {f.deletions > 0 && (
                    <span className="text-del">−{f.deletions}</span>
                  )}
                </span>
              </button>
              <button
                type="button"
                onClick={() => onToggleViewed(i)}
                aria-label={isViewed ? 'Mark not viewed' : 'Mark viewed'}
                title={isViewed ? 'Viewed' : 'Mark viewed'}
                className={cn(
                  'grid shrink-0 place-items-center rounded-[4px]',
                  'size-4',
                  'text-primary-foreground shadow-[inset_0_0_0_1.5px_var(--input)]',
                  'transition-opacity duration-100',
                  isViewed
                    ? 'bg-primary shadow-none'
                    : 'opacity-0 focus-visible:opacity-100 group-hover:opacity-100 pointer-coarse:opacity-100',
                )}
              >
                {isViewed && <Check className="size-3" strokeWidth={3} />}
              </button>
            </li>
          )
        })}
      </ul>
    </>
  )
}
