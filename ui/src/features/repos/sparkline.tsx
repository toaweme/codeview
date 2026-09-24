import { Tooltip } from '@/components/tooltip'

const BAR = 4
const GAP = 2
const HEIGHT = 20

export function Sparkline({ weeks }: { weeks: number[] }) {
  const peak = Math.max(1, ...weeks)
  const total = weeks.reduce((a, b) => a + b, 0)
  const width = weeks.length * (BAR + GAP) - GAP
  const label = `${total.toLocaleString()} ${total === 1 ? 'commit' : 'commits'} in the last ${weeks.length} weeks`
  return (
    <Tooltip label={label}>
      <span className="relative z-[1] flex shrink-0 items-end gap-2">
        <svg
          width={width}
          height={HEIGHT}
          viewBox={`0 0 ${width} ${HEIGHT}`}
          role="img"
          aria-label={label}
          className="block"
        >
          {weeks.map((n, i) => {
            const h = n === 0 ? 1 : Math.max(3, Math.round((n / peak) * HEIGHT))
            return (
              <rect
                // biome-ignore lint/suspicious/noArrayIndexKey: weeks are positional
                key={i}
                x={i * (BAR + GAP)}
                y={HEIGHT - h}
                width={BAR}
                height={h}
                rx={1}
                className={n === 0 ? 'fill-faint/40' : 'fill-primary'}
              />
            )
          })}
        </svg>
        <span className="num w-7 text-right text-faint text-xs leading-none">
          {total > 999 ? '999+' : total}
        </span>
      </span>
    </Tooltip>
  )
}
