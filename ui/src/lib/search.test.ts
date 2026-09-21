import { expect, test } from 'vitest'
import { escapeAction } from './search'

test('Test_EscapeAction', () => {
  const cases: [string, 'clear' | 'blur'][] = [
    ['main', 'clear'],
    [' ', 'clear'],
    ['', 'blur'],
  ]
  for (const [value, want] of cases) {
    expect(escapeAction(value), JSON.stringify(value)).toBe(want)
  }
})
