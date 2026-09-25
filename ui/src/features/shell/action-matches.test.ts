import { expect, test } from 'vitest'
import { actionMatches } from './action-matches'

test('Test_ActionMatches', () => {
  const cases: [string, string, number[] | null][] = [
    ['', 'Show blame', []],
    ['blame', 'Show blame', [5, 6, 7, 8, 9]],
    ['BL', 'Show blame', [5, 6]],
    ['split diff', 'Show split diff', [5, 6, 7, 8, 9, 11, 12, 13, 14]],
    ['main.go', 'Show blame', null],
    ['sbl', 'Show blame', null],
  ]
  for (const [query, label, want] of cases) {
    expect(actionMatches(query, label), `${query} in ${label}`).toEqual(want)
  }
})
