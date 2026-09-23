import type { Compare } from '@/api/types'
import type { CompareMode } from '@/lib/url'
import type { Mode } from './presets'

export type Shape = 'same' | 'forward' | 'reversed' | 'diverged'

export type CompareView = {
  shape: Shape
  mode: Mode
  dropMode: boolean
  toggle: boolean
  diff: boolean
  startingPoint: boolean
}

export function shapeOf(ahead: number, behind: number): Shape {
  if (ahead > 0 && behind > 0) return 'diverged'
  if (ahead > 0) return 'forward'
  if (behind > 0) return 'reversed'
  return 'same'
}

export function compareView(
  data: Pick<Compare, 'ahead' | 'behind' | 'head' | 'boundary'>,
  urlMode?: CompareMode,
): CompareView {
  const shape = shapeOf(data.ahead, data.behind)
  const direct = urlMode === 'direct'
  // on a same or forward range the merge base is from, so direct equals since
  const modal = shape === 'diverged' || shape === 'reversed'
  const mode: Mode = direct && modal ? 'direct' : 'since'
  const b = data.boundary
  const includable = !!b && b.parents.length > 0 && b.hash !== data.head
  return {
    shape,
    mode,
    dropMode: direct && !modal,
    toggle: shape === 'diverged',
    diff: shape === 'forward' || shape === 'diverged' || mode === 'direct',
    startingPoint: (shape === 'forward' || shape === 'diverged') && includable,
  }
}
