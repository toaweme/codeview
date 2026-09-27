import { Link } from '@tanstack/react-router'
import { Ellipsis, type LucideIcon } from 'lucide-react'
import { DropdownMenu } from 'radix-ui'
import { Fragment } from 'react'
import { SteadyLabel } from '@/components/segmented'
import { Shortcut } from '@/components/shortcut'
import { Tooltip } from '@/components/tooltip'
import { cn } from '@/lib/cn'
import type { KeyId } from '@/lib/keymap'
import { type CrumbMenu, CrumbSwitch } from './crumb-switch'

export type LinkTarget =
  | { to: '/' }
  | { to: '/$org/$'; params: { org: string; _splat: string } }

export type Crumb = {
  label: React.ReactNode
  link?: LinkTarget
  // menu adds a switcher between the crumb's siblings next to its link
  menu?: CrumbMenu
  key: string
}

export function TopLine({
  crumbs,
  children,
}: {
  crumbs: Crumb[]
  children?: React.ReactNode
}) {
  return (
    <div className="topbar flex h-(--topbar-h) shrink-0 items-center gap-6 bg-band pr-3 pl-4">
      <nav
        aria-label="Breadcrumb"
        className="flex min-w-0 flex-1 items-center text-base"
      >
        {crumbs.map((c, i) => {
          const last = i === crumbs.length - 1
          const grow = last
            ? 'shrink min-w-[6ch]'
            : i === 1
              ? 'shrink-[2] min-w-[4ch]'
              : 'shrink-[12] min-w-[2ch]'
          const title = typeof c.label === 'string' ? c.label : undefined
          // the current page is plain text, every other crumb with a target is a link
          const name =
            c.link && !last ? (
              <Link
                {...c.link}
                title={title}
                className={cn(
                  CRUMB,
                  'text-muted-foreground transition-colors duration-100 hover:bg-hover hover:text-foreground',
                  !c.menu && grow,
                )}
              >
                {c.label}
              </Link>
            ) : (
              <span
                title={title}
                aria-current={last ? 'page' : undefined}
                className={cn(
                  CRUMB,
                  last
                    ? 'font-semibold text-foreground'
                    : 'text-muted-foreground',
                  !c.menu && grow,
                )}
              >
                {c.label}
              </span>
            )
          return (
            <Fragment key={c.key}>
              {i > 0 && (
                <span
                  aria-hidden
                  className="mx-1 h-3.5 w-px shrink-0 rotate-[18deg] rounded-full bg-faint/50"
                />
              )}
              {c.menu ? (
                <span className={cn('flex min-w-0 items-center gap-0.5', grow)}>
                  {name}
                  <CrumbSwitch menu={c.menu} />
                </span>
              ) : (
                name
              )}
            </Fragment>
          )
        })}
      </nav>
      <div className="flex shrink-0 items-center gap-3">{children}</div>
    </div>
  )
}

const CRUMB =
  'block h-7 min-w-0 truncate rounded-md px-1.5 leading-7 outline-none focus-visible:outline-2 focus-visible:outline-ring'

export function Group({ children }: { children: React.ReactNode }) {
  return <div className="flex shrink-0 items-center gap-1.5">{children}</div>
}

export type SwitchItem = {
  key: string
  label: string
  icon: LucideIcon
  active: boolean
  disabled?: boolean
} & (
  | {
      link: LinkTarget
      hash?: (prev: string | undefined) => string
      onClick?: never
    }
  | { onClick: () => void; link?: never; hash?: never }
)

const SEG = [
  'flex h-8 shrink-0 items-center gap-2 whitespace-nowrap',
  'rounded-md px-3 text-sm transition-colors duration-100',
  'focus-visible:outline-2 focus-visible:outline-ring',
  '[&_svg]:size-4 [&_svg]:shrink-0',
].join(' ')
const SEG_ON =
  'bg-background font-medium text-foreground shadow-[0_1px_2px_rgb(0_0_0/0.1)]'
const SEG_OFF = 'text-muted-foreground hover:bg-hover hover:text-foreground'
const SEG_DIS = 'cursor-default text-faint opacity-60'

export function ViewSwitch({
  items,
  label,
}: {
  items: SwitchItem[]
  label: string
}) {
  return (
    <fieldset
      aria-label={label}
      className="flex h-9 shrink-0 items-center gap-0.5 rounded-lg bg-island-muted p-0.5"
    >
      {items.map((it) => {
        const Icon = it.icon
        const inner = (
          <>
            <Icon aria-hidden />
            <SteadyLabel className="hidden lg:inline-grid">
              {it.label}
            </SteadyLabel>
          </>
        )
        const cls = cn(
          SEG,
          it.disabled ? SEG_DIS : it.active ? SEG_ON : SEG_OFF,
        )
        return (
          <Tooltip key={it.key} label={it.label} side="bottom">
            {it.disabled ? (
              <button
                type="button"
                aria-label={it.label}
                aria-disabled
                className={cls}
              >
                {inner}
              </button>
            ) : it.link ? (
              <Link
                {...it.link}
                hash={it.hash}
                aria-label={it.label}
                aria-current={it.active ? 'page' : undefined}
                className={cls}
              >
                {inner}
              </Link>
            ) : (
              <button
                type="button"
                aria-label={it.label}
                aria-pressed={it.active}
                onClick={it.onClick}
                className={cls}
              >
                {inner}
              </button>
            )}
          </Tooltip>
        )
      })}
    </fieldset>
  )
}

export type MenuItem = {
  key: string
  label: string
  icon: LucideIcon
  run?: () => void
  href?: string
  link?: LinkTarget
  shortcut?: KeyId
}

const MORE_BTN =
  'grid size-9 place-items-center rounded-lg text-muted-foreground transition-colors duration-100 focus-visible:outline-2 focus-visible:outline-ring'

export function MoreMenu({ items }: { items: MenuItem[] }) {
  if (items.length === 0)
    return (
      <button
        type="button"
        aria-label="More actions"
        aria-disabled
        className={cn(MORE_BTN, 'cursor-default text-faint opacity-60')}
      >
        <Ellipsis className="size-5" aria-hidden />
      </button>
    )
  return (
    <DropdownMenu.Root modal={false}>
      <Tooltip label="More actions" side="bottom">
        <DropdownMenu.Trigger asChild>
          <button
            type="button"
            aria-label="More actions"
            className={cn(
              MORE_BTN,
              'hover:bg-hover hover:text-foreground data-[state=open]:bg-accent data-[state=open]:text-foreground',
            )}
          >
            <Ellipsis className="size-5" aria-hidden />
          </button>
        </DropdownMenu.Trigger>
      </Tooltip>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          className="z-50 min-w-56 rounded-xl bg-island p-1.5 shadow-[0_0_0_1px_var(--border),0_16px_40px_-12px_rgb(0_0_0/0.35)]"
        >
          {items.map((it) => {
            const Icon = it.icon
            const body = (
              <>
                <Icon className="size-4 shrink-0 text-faint" aria-hidden />
                <span className="flex-1">{it.label}</span>
                {it.shortcut && <Shortcut id={it.shortcut} className="ml-4" />}
              </>
            )
            const cls =
              'flex h-9 cursor-default select-none items-center gap-3 rounded-lg px-3 text-base outline-none data-[highlighted]:bg-accent'
            if (it.link)
              return (
                <DropdownMenu.Item key={it.key} asChild className={cls}>
                  <Link {...it.link}>{body}</Link>
                </DropdownMenu.Item>
              )
            return it.href ? (
              <DropdownMenu.Item key={it.key} asChild className={cls}>
                <a href={it.href} target="_blank" rel="noreferrer">
                  {body}
                </a>
              </DropdownMenu.Item>
            ) : (
              <DropdownMenu.Item key={it.key} onSelect={it.run} className={cls}>
                {body}
              </DropdownMenu.Item>
            )
          })}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
