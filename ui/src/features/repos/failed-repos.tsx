import { Link } from '@tanstack/react-router'
import { ChevronRight, TriangleAlert } from 'lucide-react'
import { Dialog } from 'radix-ui'
import { useState } from 'react'
import type { RepoFailure } from '@/api/types'
import { cn } from '@/lib/cn'
import { repoLink } from '@/lib/url'
import { failedSummary } from './unreadable'

// FailedRepos is the one-line bar a merged feed shows when it skipped repositories.
// It never lists names inline so it stays one line, and opens the full list on demand.
export function FailedRepos({ failed }: { failed: RepoFailure[] }) {
  const [open, setOpen] = useState(false)
  if (failed.length === 0) return null
  const summary = failedSummary(failed.length)
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          className={cn(
            'group flex w-full min-w-0 items-center gap-3 rounded-2xl p-2.5 text-left',
            'bg-linear-to-r from-del/15 via-del-bg to-del-bg ring-1 ring-del/20 ring-inset',
            'transition-shadow duration-100 hover:ring-del/40',
            'outline-none focus-visible:outline-2 focus-visible:outline-ring',
          )}
        >
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-del/15 text-del">
            <TriangleAlert className="size-4" aria-hidden />
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate font-medium text-foreground">
              {summary}
            </span>
            <span className="truncate text-muted-foreground text-sm">
              They are left out of this list until the server can read them
              again.
            </span>
          </span>
          <span
            className={cn(
              'flex shrink-0 items-center gap-1 rounded-full bg-island px-3 py-1 font-medium text-del text-sm ring-1 ring-del/20',
              'transition-colors duration-100 group-hover:bg-del group-hover:text-white group-hover:ring-del',
            )}
          >
            View
            <ChevronRight
              className="size-3.5 transition-transform duration-100 group-hover:translate-x-0.5"
              aria-hidden
            />
          </span>
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/30 dark:bg-black/50" />
        <Dialog.Content
          className={cn(
            'fixed top-2 left-1/2 z-50 -translate-x-1/2 sm:top-[10vh]',
            'flex max-h-[min(80vh,calc(100dvh-16px))] w-[min(560px,calc(100vw-16px))]',
            'flex-col overflow-hidden rounded-2xl bg-island',
            'shadow-[0_0_0_1px_var(--border),0_24px_64px_-12px_rgb(0_0_0/0.45)]',
            'focus:outline-none',
          )}
        >
          <div className="flex shrink-0 items-center gap-2.5 px-6 pt-5 pb-3">
            <TriangleAlert className="size-5 shrink-0 text-del" aria-hidden />
            <Dialog.Title className="font-semibold text-lg">
              {summary}
            </Dialog.Title>
          </div>
          <Dialog.Description className="shrink-0 px-6 pb-3 text-muted-foreground">
            They are left out of this list until the server can read them again.
          </Dialog.Description>
          <ul className="min-h-0 flex-1 overflow-auto px-3 pb-3">
            {failed.map((f) => (
              <li key={f.repo}>
                <Link
                  {...repoLink(f.repo, { kind: 'tree', path: '' })}
                  onClick={() => setOpen(false)}
                  className={cn(
                    'block truncate rounded-lg px-3 py-2 font-medium',
                    'hover:bg-hover outline-none focus-visible:outline-2 focus-visible:outline-ring',
                  )}
                >
                  {f.repo}
                </Link>
              </li>
            ))}
          </ul>
          <p className="shrink-0 border-border/70 border-t px-6 py-3 text-faint text-sm">
            Details are in the server log.
          </p>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
