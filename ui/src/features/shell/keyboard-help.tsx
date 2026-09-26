import { Search } from 'lucide-react'
import { Dialog } from 'radix-ui'
import { useEffect, useMemo, useState } from 'react'
import { Shortcut } from '@/components/shortcut'
import { cn } from '@/lib/cn'
import { onKeyboardHelpOpen } from '@/lib/commands'
import {
  type Context,
  chordsOf,
  KEY_IDS,
  KEYMAP,
  type KeyId,
  PLATFORM,
  useKeys,
} from '@/lib/keymap'

const SECTIONS: { ctx: Context; title: string }[] = [
  { ctx: 'global', title: 'Global' },
  { ctx: 'repo', title: 'Repository' },
]

export function KeyboardHelp() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const show = () => {
    setQuery('')
    setOpen(true)
  }
  useKeys({
    'help.open': () => {
      if (open) setOpen(false)
      else show()
    },
  })
  // biome-ignore lint/correctness/useExhaustiveDependencies: show only sets state
  useEffect(() => onKeyboardHelpOpen(show), [])

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase()
    const hit = (id: KeyId, title: string) =>
      !q ||
      `${KEYMAP[id].label} ${title} ${chordsOf(id)
        .flatMap((k) => [k.join(''), k.join('+')])
        .join(' ')}`
        .toLowerCase()
        .includes(q)
    return SECTIONS.map((c) => ({
      ...c,
      ids: KEY_IDS.filter(
        (id) => KEYMAP[id].context === c.ctx && hit(id, c.title),
      ),
    })).filter((c) => c.ids.length > 0)
  }, [query])

  const empty = groups.length === 0

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/30 dark:bg-black/50" />
        <Dialog.Content
          className={cn(
            'fixed top-[10vh] left-1/2 z-50 -translate-x-1/2',
            'flex max-h-[80vh] w-[min(720px,calc(100vw-32px))]',
            'flex-col overflow-hidden rounded-2xl bg-island',
            'shadow-[0_0_0_1px_var(--border),0_24px_64px_-12px_rgb(0_0_0/0.45)]',
            'focus:outline-none',
          )}
          onEscapeKeyDown={(e) => {
            if (!query) return
            e.preventDefault()
            setQuery('')
          }}
        >
          <div className="shrink-0 px-6 pt-5 pb-4">
            <div className="flex items-baseline justify-between gap-4">
              <Dialog.Title className="font-semibold text-lg">
                Keyboard shortcuts
              </Dialog.Title>
              <span className="text-faint text-sm">
                {PLATFORM === 'mac' ? 'macOS keys' : 'Windows and Linux keys'}
              </span>
            </div>
            <Dialog.Description className="sr-only">
              Every keyboard shortcut.
            </Dialog.Description>
            <div
              className={cn(
                'relative mt-4 flex h-10 items-center rounded-lg bg-island-muted',
                'text-faint focus-within:ring-2 focus-within:ring-ring/40',
              )}
            >
              <Search
                className="pointer-events-none absolute left-3 size-4"
                aria-hidden
              />
              <input
                // biome-ignore lint/a11y/noAutofocus: the help opens to be searched
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search shortcuts"
                aria-label="Search shortcuts"
                className="h-full min-w-0 flex-1 bg-transparent pr-3 pl-9 text-foreground outline-none placeholder:text-faint"
              />
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-auto px-6 pb-2">
            {empty && (
              <p className="py-10 text-center text-muted-foreground">
                No shortcut matches “{query.trim()}”.
              </p>
            )}
            {groups.map((g) => (
              <section key={g.ctx} className="mb-5 px-4">
                <h3 className="font-semibold">{g.title}</h3>
                <Rows ids={g.ids} />
              </section>
            ))}
          </div>

          <footer
            className={cn(
              'flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1',
              'border-border/70 border-t px-6 py-3 text-faint text-sm',
            )}
          >
            <span className="flex items-center gap-1.5 font-semibold text-muted-foreground tracking-tight">
              <Mark />
              codeview
            </span>
            <span className="num">
              {__APP_VERSION__}
              {__APP_COMMIT__ && ` (${__APP_COMMIT__})`}
            </span>
            <span className="ml-auto">
              A read-only code browser for your soft-serve repositories.
            </span>
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function Rows({ ids }: { ids: KeyId[] }) {
  return (
    <ul className="mt-1 grid gap-x-8 sm:grid-cols-2">
      {ids.map((id) => (
        <li
          key={id}
          className="flex min-h-9 items-center justify-between gap-3 text-muted-foreground"
        >
          <span className="min-w-0">{KEYMAP[id].label}</span>
          <Shortcut id={id} />
        </li>
      ))}
    </ul>
  )
}

function Mark() {
  return (
    <svg
      viewBox="0 0 16 16"
      className="size-4 text-primary"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      aria-hidden="true"
    >
      <path d="M4 8h8" />
      <circle cx="3.5" cy="8" r="2" fill="var(--island)" />
      <circle cx="12.5" cy="8" r="2" fill="currentColor" />
    </svg>
  )
}
