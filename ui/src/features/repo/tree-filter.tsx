import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { File } from 'lucide-react'
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { filesQuery, type ResolvedRef } from '@/api/queries'
import { Highlighted } from '@/components/highlighted'
import { SearchInput } from '@/components/search-input'
import { cn } from '@/lib/cn'
import { rankPaths } from '@/lib/fuzzy'
import { usePressPreload } from '@/lib/preload'
import { repoLink } from '@/lib/url'
import { FileTree } from './file-tree'

const LIMIT = 200

export function TreeFilter({
  repo,
  resolved,
  current,
}: {
  repo: string
  resolved: ResolvedRef
  current: string
}) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const preload = usePressPreload()
  const [query, setQuery] = useState('')
  const [sel, setSel] = useState(0)
  const listRef = useRef<HTMLUListElement>(null)
  const deferred = useDeferredValue(query.trim())
  const files = useQuery({
    ...filesQuery(qc, repo, resolved.rev),
    enabled: deferred !== '',
  })
  const results = useMemo(
    () =>
      deferred && files.data
        ? rankPaths(deferred, files.data.files, LIMIT)
        : [],
    [deferred, files.data],
  )
  const ref = resolved.isDefault ? undefined : resolved.name

  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-index="${sel}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  }, [sel])

  const open = (path: string | undefined) => {
    if (!path) return
    navigate(repoLink(repo, { kind: 'blob', ref, path }))
  }

  return (
    <>
      <div className="shrink-0 px-2 pb-2">
        <SearchInput
          value={query}
          onChange={(v) => {
            setQuery(v)
            setSel(0)
          }}
          placeholder="Filter files"
          onKeyDown={(e) => {
            if (!query) return
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setSel((s) => Math.min(s + 1, results.length - 1))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setSel((s) => Math.max(s - 1, 0))
            } else if (e.key === 'Enter') {
              e.preventDefault()
              open(results[sel]?.path)
            }
          }}
        />
      </div>
      {!query ? (
        <FileTree repo={repo} resolved={resolved} current={current} />
      ) : (
        <ul ref={listRef} className="min-h-0 flex-1 overflow-auto px-2 pb-3">
          {files.isPending ? (
            <li className="px-2.5 py-3 text-faint">Indexing files…</li>
          ) : results.length === 0 ? (
            <li className="px-2.5 py-3 text-muted-foreground">
              No file matches “{query.trim()}”.
            </li>
          ) : (
            results.map((r, i) => {
              const link = repoLink(repo, { kind: 'blob', ref, path: r.path })
              return (
                <li key={r.path} data-index={i}>
                  <Link
                    {...link}
                    {...preload(link)}
                    title={r.path}
                    className={cn(
                      'flex h-(--row-h) items-center gap-2.5 rounded-lg px-2.5 transition-colors duration-75 hover:bg-hover pointer-coarse:h-11',
                      i === sel && 'bg-hover',
                      r.path === current && 'bg-active',
                    )}
                  >
                    <File className="size-4 shrink-0 text-faint" aria-hidden />
                    <span className="min-w-0 flex-1 truncate" dir="rtl">
                      <span dir="ltr">
                        <Highlighted text={r.path} positions={r.positions} />
                      </span>
                    </span>
                  </Link>
                </li>
              )
            })
          )}
        </ul>
      )}
    </>
  )
}
