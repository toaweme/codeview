import { Link, useNavigate, useRouterState } from '@tanstack/react-router'
import {
  Code2,
  GitCompareArrows,
  Keyboard,
  Library,
  Moon,
  PanelLeft,
  RotateCcwClock,
  Search,
  Sun,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import type { ResolvedRef } from '@/api/queries'
import type { Refs } from '@/api/types'
import { WithShortcut } from '@/components/shortcut'
import { Tooltip } from '@/components/tooltip'
import { cn } from '@/lib/cn'
import { openKeyboardHelp, openPalette, useCommands } from '@/lib/commands'
import { type KeyId, useKeys } from '@/lib/keymap'
import { useTheme } from '@/lib/theme-context'
import { repoLink } from '@/lib/url'
import { useMedia, WIDE } from '@/lib/use-media'
import { usePersistedState } from '@/lib/use-persisted-state'
import { CommandPalette } from './command-palette'
import type { LinkTarget } from './top-line'

export type Section = 'repos' | 'code' | 'history' | 'compare'

const MIN_W = 220
const MAX_W = 600
const DEFAULT_W = 300

export function AppShell({
  section,
  sidebar,
  children,
  repo,
  linkRef,
  resolved,
  refs,
  onRef,
}: {
  section: Section
  sidebar: React.ReactNode
  children: React.ReactNode
  repo?: string
  linkRef?: string
  resolved?: ResolvedRef | null
  refs?: Refs
  onRef?: (name: string) => void
}) {
  const [pinned, setPinned] = usePersistedState('sidebar:open', true)
  const [width, setWidth] = usePersistedState('sidebar:width', DEFAULT_W)
  const [drawer, setDrawer] = useState(false)
  const wide = useMedia(WIDE)
  const { toggle: toggleTheme } = useTheme()
  const navigate = useNavigate()
  const href = useRouterState({ select: (s) => s.location.href })

  // the drawer covers the page, so following a link out of it shuts it
  // biome-ignore lint/correctness/useExhaustiveDependencies: href is the trigger
  useEffect(() => {
    setDrawer(false)
  }, [href, wide])

  useEffect(() => {
    if (!drawer) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDrawer(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [drawer])

  const open = wide ? pinned : drawer
  const setOpen = wide ? setPinned : setDrawer

  useKeys({
    'palette.files': () => openPalette(),
    'palette.actions': () => openPalette('>'),
    'sidebar.toggle': () => setOpen((o) => !o),
  })
  useCommands([
    {
      id: 'shell:repos',
      label: 'Go to repositories',
      icon: Library,
      run: () => navigate({ to: '/' }),
    },
    {
      id: 'shell:sidebar',
      label: 'Toggle sidebar',
      icon: PanelLeft,
      shortcut: 'sidebar.toggle',
      run: () => setOpen((o) => !o),
    },
    {
      id: 'shell:theme',
      label: 'Toggle light and dark theme',
      icon: Sun,
      run: toggleTheme,
    },
    {
      id: 'shell:shortcuts',
      label: 'Show keyboard shortcuts',
      icon: Keyboard,
      shortcut: 'help.open',
      run: openKeyboardHelp,
    },
  ])

  const startDrag = (e: React.PointerEvent) => {
    e.preventDefault()
    const startX = e.clientX
    const startW = width
    const move = (ev: PointerEvent) => {
      setWidth(Math.min(MAX_W, Math.max(MIN_W, startW + ev.clientX - startX)))
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      document.body.style.cursor = ''
    }
    document.body.style.cursor = 'col-resize'
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  return (
    <div className="flex h-full flex-col gap-(--gap) overflow-hidden bg-canvas p-(--gap) pb-[max(var(--gap),env(safe-area-inset-bottom))] sm:flex-row sm:pb-(--gap) sm:pl-0">
      <nav
        aria-label="Main"
        className="order-last flex shrink-0 items-center gap-1 overflow-x-auto sm:order-none sm:w-(--rail-w) sm:flex-col sm:gap-1.5 sm:overflow-visible sm:pl-2"
      >
        <RailLink
          label="Repositories"
          active={section === 'repos'}
          link={{ to: '/' }}
        >
          <Library />
        </RailLink>
        <RailButton
          label="Go to file"
          shortcut="palette.files"
          onClick={() => openPalette()}
        >
          <Search />
        </RailButton>
        {repo && (
          <>
            <RailLink
              label="Code"
              active={section === 'code'}
              link={repoLink(repo, { kind: 'tree', ref: linkRef, path: '' })}
            >
              <Code2 />
            </RailLink>
            <RailLink
              label="History"
              active={section === 'history'}
              link={repoLink(repo, { kind: 'commits', ref: linkRef, path: '' })}
            >
              <RotateCcwClock />
            </RailLink>
            <RailLink
              label="Compare"
              active={section === 'compare'}
              link={repoLink(repo, { kind: 'compare', base: '', head: '' })}
            >
              <GitCompareArrows />
            </RailLink>
          </>
        )}
        <div className="flex-1" />
        <RailButton
          label={open ? 'Hide sidebar' : 'Show sidebar'}
          shortcut="sidebar.toggle"
          onClick={() => setOpen((o) => !o)}
          pressed={!wide && open}
        >
          <PanelLeft />
        </RailButton>
        <RailButton label="Toggle theme" onClick={toggleTheme}>
          <Sun className="hidden dark:block" />
          <Moon className="block dark:hidden" />
        </RailButton>
        <RailButton
          label="Keyboard shortcuts"
          shortcut="help.open"
          onClick={openKeyboardHelp}
          className="hidden sm:grid"
        >
          <Keyboard />
        </RailButton>
      </nav>
      {wide
        ? open && (
            <aside
              className="island relative flex shrink-0 flex-col"
              style={{ width }}
            >
              {sidebar}
              {/* biome-ignore lint/a11y/noStaticElementInteractions: pointer-only resize handle, width is also persisted */}
              <div
                onPointerDown={startDrag}
                onDoubleClick={() => setWidth(DEFAULT_W)}
                className="group/resize absolute inset-y-0 right-[calc(var(--gap)*-1)] z-10 flex w-(--gap) cursor-col-resize justify-center"
              >
                <span className="my-auto h-10 w-1 rounded-full bg-transparent transition-colors duration-100 group-hover/resize:bg-primary/50" />
              </div>
            </aside>
          )
        : sidebar && (
            <>
              <button
                type="button"
                aria-label="Close sidebar"
                tabIndex={-1}
                onClick={() => setDrawer(false)}
                className={cn(
                  'fixed inset-0 z-40 cursor-default bg-black/40 transition-opacity duration-200',
                  !open && 'pointer-events-none opacity-0',
                )}
              />
              <aside
                aria-label="Sidebar"
                inert={!open}
                className={cn(
                  'island fixed inset-y-(--gap) left-(--gap) z-40 flex w-[min(340px,calc(100vw-48px))] flex-col',
                  'shadow-[0_24px_60px_-12px_rgb(0_0_0/0.45)] transition-[translate,visibility] duration-200 ease-out',
                  !open && 'invisible -translate-x-[calc(100%+var(--gap)*2)]',
                )}
              >
                {sidebar}
              </aside>
            </>
          )}
      <main className="island relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {children}
      </main>
      <CommandPalette
        repo={repo}
        resolved={resolved ?? undefined}
        refs={refs}
        onRef={onRef}
      />
    </div>
  )
}

const RAIL = [
  'grid size-10 shrink-0 place-items-center rounded-lg sm:pointer-fine:size-9',
  'text-muted-foreground transition-colors duration-100',
  'hover:bg-island/60 hover:text-foreground',
  'focus-visible:outline-2 focus-visible:outline-ring',
  '[&_svg]:size-5 [&_svg]:stroke-[1.75]',
].join(' ')

function RailButton({
  label,
  shortcut,
  onClick,
  pressed,
  className,
  children,
}: {
  label: string
  shortcut?: KeyId
  onClick: () => void
  pressed?: boolean
  className?: string
  children: React.ReactNode
}) {
  return (
    <Tooltip label={<WithShortcut label={label} id={shortcut} />} side="right">
      <button
        type="button"
        aria-label={label}
        aria-pressed={pressed}
        onClick={onClick}
        className={cn(RAIL, pressed && 'bg-island text-primary', className)}
      >
        {children}
      </button>
    </Tooltip>
  )
}

function RailLink({
  label,
  shortcut,
  active,
  link,
  children,
}: {
  label: string
  shortcut?: KeyId
  active: boolean
  link: LinkTarget
  children: React.ReactNode
}) {
  return (
    <Tooltip label={<WithShortcut label={label} id={shortcut} />} side="right">
      <Link
        {...link}
        aria-label={label}
        aria-current={active ? 'page' : undefined}
        className={cn(
          RAIL,
          active && 'bg-island text-primary hover:bg-island hover:text-primary',
        )}
      >
        {children}
      </Link>
    </Tooltip>
  )
}

export function SidebarHeader({ children }: { children?: React.ReactNode }) {
  return (
    <div className="flex h-(--topbar-h) shrink-0 items-center gap-2 pr-2 pl-4">
      {children}
    </div>
  )
}
