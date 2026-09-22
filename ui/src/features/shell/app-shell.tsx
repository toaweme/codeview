import { Link, useNavigate } from '@tanstack/react-router'
import {
  Code2,
  Library,
  Moon,
  PanelLeft,
  RotateCcwClock,
  Sun,
} from 'lucide-react'
import { WithShortcut } from '@/components/shortcut'
import { Tooltip } from '@/components/tooltip'
import { cn } from '@/lib/cn'
import { useCommands } from '@/lib/commands'
import { type KeyId, useKeys } from '@/lib/keymap'
import { useTheme } from '@/lib/theme-context'
import { repoLink } from '@/lib/url'
import { usePersistedState } from '@/lib/use-persisted-state'
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
}: {
  section: Section
  sidebar: React.ReactNode
  children: React.ReactNode
  repo?: string
  linkRef?: string
}) {
  const [open, setOpen] = usePersistedState('sidebar:open', true)
  const [width, setWidth] = usePersistedState('sidebar:width', DEFAULT_W)
  const { toggle: toggleTheme } = useTheme()
  const navigate = useNavigate()

  useKeys({
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
    <div className="flex h-full gap-(--gap) overflow-hidden bg-canvas p-(--gap) pl-0">
      <nav
        aria-label="Main"
        className="flex w-(--rail-w) shrink-0 flex-col items-center gap-1.5 pl-2"
      >
        <RailLink
          label="Repositories"
          active={section === 'repos'}
          link={{ to: '/' }}
        >
          <Library />
        </RailLink>
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
          </>
        )}
        <div className="flex-1" />
        <RailButton
          label={open ? 'Hide sidebar' : 'Show sidebar'}
          shortcut="sidebar.toggle"
          onClick={() => setOpen((o) => !o)}
        >
          <PanelLeft />
        </RailButton>
        <RailButton label="Toggle theme" onClick={toggleTheme}>
          <Sun className="hidden dark:block" />
          <Moon className="block dark:hidden" />
        </RailButton>
      </nav>
      {open && (
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
      )}
      <main className="island relative flex min-w-0 flex-1 flex-col overflow-hidden">
        {children}
      </main>
    </div>
  )
}

const RAIL = [
  'grid size-9 place-items-center rounded-lg',
  'text-muted-foreground transition-colors duration-100',
  'hover:bg-island/60 hover:text-foreground',
  'focus-visible:outline-2 focus-visible:outline-ring',
  '[&_svg]:size-5 [&_svg]:stroke-[1.75]',
].join(' ')

function RailButton({
  label,
  shortcut,
  onClick,
  children,
}: {
  label: string
  shortcut?: KeyId
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <Tooltip label={<WithShortcut label={label} id={shortcut} />} side="right">
      <button
        type="button"
        aria-label={label}
        onClick={onClick}
        className={RAIL}
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
