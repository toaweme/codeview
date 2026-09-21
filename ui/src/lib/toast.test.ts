import { describe, expect, test } from 'vitest'
import { createToasts } from './toast'

describe('createToasts', () => {
  const cases: {
    name: string
    shown: string[]
    expire: number
    want: string[]
  }[] = [
    { name: 'one', shown: ['a'], expire: 0, want: ['a'] },
    { name: 'keeps order', shown: ['a', 'b'], expire: 0, want: ['a', 'b'] },
    {
      name: 'caps at three',
      shown: ['a', 'b', 'c', 'd'],
      expire: 0,
      want: ['b', 'c', 'd'],
    },
    { name: 'oldest expires', shown: ['a', 'b'], expire: 1, want: ['b'] },
    { name: 'all expire', shown: ['a', 'b'], expire: 2, want: [] },
  ]
  for (const c of cases) {
    test(c.name, () => {
      const timers: (() => void)[] = []
      const t = createToasts(((fn: () => void) => {
        timers.push(fn)
        return 0
      }) as unknown as typeof setTimeout)
      for (const m of c.shown) t.show(m)
      for (const fn of timers.slice(0, c.expire)) fn()
      expect(t.get().map((x) => x.message)).toEqual(c.want)
    })
  }

  test('notifies subscribers until unsubscribed', () => {
    const t = createToasts((() => 0) as unknown as typeof setTimeout)
    const seen: number[] = []
    const off = t.subscribe((xs) => seen.push(xs.length))
    t.show('a')
    off()
    t.show('b')
    expect(seen).toEqual([1])
  })
})
