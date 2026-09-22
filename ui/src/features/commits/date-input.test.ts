import { describe, expect, test } from 'vitest'
import {
  type DayOrder,
  describeRange,
  localeOrder,
  orderRange,
  type ParsedInput,
  parseDateInput,
} from './date-input'

// late in the month so month steps back clamp
const now = new Date(2026, 8, 25, 14, 30)

const span = (since: string, until = since, range = false): ParsedInput => ({
  kind: 'span',
  span: { since, until },
  range,
})

describe('parseDateInput', () => {
  const cases: {
    name: string
    text: string
    order?: DayOrder
    want: ParsedInput
  }[] = [
    { name: 'empty', text: '', want: { kind: 'empty' } },
    { name: 'blank', text: '   ', want: { kind: 'empty' } },
    { name: 'iso day', text: '2026-08-01', want: span('2026-08-01') },
    { name: 'iso day unpadded', text: '2026-8-1', want: span('2026-08-01') },
    { name: 'iso with slashes', text: '2026/08/01', want: span('2026-08-01') },
    { name: 'iso trims', text: '  2026-08-01 ', want: span('2026-08-01') },
    {
      name: 'month expands',
      text: '2026-02',
      want: span('2026-02-01', '2026-02-28'),
    },
    {
      name: 'leap month expands',
      text: '2024-02',
      want: span('2024-02-01', '2024-02-29'),
    },
    {
      name: 'year expands',
      text: '2025',
      want: span('2025-01-01', '2025-12-31'),
    },
    { name: 'dotted day first', text: '25.09.2026', want: span('2026-09-25') },
    { name: 'slashed day first', text: '25/09/2026', want: span('2026-09-25') },
    {
      name: 'ambiguous follows locale, day first',
      text: '03/04/2026',
      order: 'dmy',
      want: span('2026-04-03'),
    },
    {
      name: 'ambiguous follows locale, month first',
      text: '03/04/2026',
      order: 'mdy',
      want: span('2026-03-04'),
    },
    {
      name: 'impossible month flips order',
      text: '09/25/2026',
      order: 'dmy',
      want: span('2026-09-25'),
    },
    {
      name: 'impossible day flips order',
      text: '25/09/2026',
      order: 'mdy',
      want: span('2026-09-25'),
    },
    {
      name: 'ymd locale reads numeric as day first',
      text: '03.04.2026',
      order: 'ymd',
      want: span('2026-04-03'),
    },
    { name: 'today', text: 'today', want: span('2026-09-25') },
    { name: 'today any case', text: 'Today', want: span('2026-09-25') },
    { name: 'yesterday', text: 'yesterday', want: span('2026-09-24') },
    { name: 'days ago', text: '7d', want: span('2026-09-18') },
    { name: 'weeks ago', text: '2w', want: span('2026-09-11') },
    { name: 'months ago', text: '3m', want: span('2026-06-25') },
    { name: 'years ago', text: '1y', want: span('2025-09-25') },
    { name: 'unit with space', text: '7 d', want: span('2026-09-18') },
    {
      name: 'dotted range',
      text: '2026-08-01..2026-09-01',
      want: span('2026-08-01', '2026-09-01', true),
    },
    {
      name: 'dash range',
      text: '2026-08-01 - 2026-09-01',
      want: span('2026-08-01', '2026-09-01', true),
    },
    {
      name: 'to range',
      text: '1.8.2026 to 1.9.2026',
      want: span('2026-08-01', '2026-09-01', true),
    },
    {
      name: 'range of months covers both',
      text: '2026-07..2026-08',
      want: span('2026-07-01', '2026-08-31', true),
    },
    {
      name: 'backwards range swaps',
      text: '2026-09-01..2026-08-01',
      want: span('2026-08-01', '2026-09-01', true),
    },
    {
      name: 'backwards month range swaps',
      text: '2026-09..2026-08',
      want: span('2026-08-01', '2026-09-30', true),
    },
    {
      name: 'relative range',
      text: '1m..today',
      want: span('2026-08-25', '2026-09-25', true),
    },
    { name: 'words', text: 'last tuesday', want: { kind: 'invalid' } },
    { name: 'rolled over day', text: '2026-02-30', want: { kind: 'invalid' } },
    { name: 'month 13', text: '2026-13', want: { kind: 'invalid' } },
    {
      name: 'both orders impossible',
      text: '13/13/2026',
      want: { kind: 'invalid' },
    },
    { name: 'two digit year', text: '25.09.26', want: { kind: 'invalid' } },
    { name: 'unknown unit', text: '7x', want: { kind: 'invalid' } },
    { name: 'half a range', text: '2026-08-01..', want: { kind: 'invalid' } },
    {
      name: 'range with a bad side',
      text: '2026-08-01..nope',
      want: { kind: 'invalid' },
    },
    {
      name: 'three sides',
      text: '2025..2026..2027',
      want: { kind: 'invalid' },
    },
  ]
  for (const c of cases)
    test(c.name, () => {
      expect(parseDateInput(c.text, now, c.order ?? 'dmy')).toEqual(c.want)
    })
})

describe('orderRange', () => {
  const cases: {
    name: string
    in: { since?: string; until?: string }
    want: { since?: string; until?: string }
  }[] = [
    {
      name: 'in order',
      in: { since: '2026-08-01', until: '2026-09-01' },
      want: { since: '2026-08-01', until: '2026-09-01' },
    },
    {
      name: 'from after to swaps',
      in: { since: '2026-09-01', until: '2026-08-01' },
      want: { since: '2026-08-01', until: '2026-09-01' },
    },
    {
      name: 'open end',
      in: { since: '2026-09-01' },
      want: { since: '2026-09-01' },
    },
  ]
  for (const c of cases)
    test(c.name, () => {
      expect(orderRange(c.in)).toEqual(c.want)
    })
})

describe('describeRange', () => {
  const cases: {
    name: string
    in: { since?: string; until?: string }
    want: string
  }[] = [
    {
      name: 'same year',
      in: { since: '2026-08-01', until: '2026-09-01' },
      want: 'Aug 1 to Sep 1, 2026 (32 days)',
    },
    {
      name: 'across years',
      in: { since: '2025-12-20', until: '2026-01-05' },
      want: 'Dec 20, 2025 to Jan 5, 2026 (17 days)',
    },
    {
      name: 'one day',
      in: { since: '2026-08-01', until: '2026-08-01' },
      want: 'Aug 1, 2026 (1 day)',
    },
    {
      name: 'across a clock change',
      in: { since: '2026-03-01', until: '2026-03-31' },
      want: 'Mar 1 to Mar 31, 2026 (31 days)',
    },
    {
      name: 'from only',
      in: { since: '2026-08-01' },
      want: 'From Aug 1, 2026 onwards',
    },
    { name: 'to only', in: { until: '2026-08-01' }, want: 'Up to Aug 1, 2026' },
    { name: 'open', in: {}, want: 'Any time' },
  ]
  for (const c of cases)
    test(c.name, () => {
      expect(describeRange(c.in)).toBe(c.want)
    })
})

describe('localeOrder', () => {
  const cases: { locale: string; want: DayOrder }[] = [
    { locale: 'en-US', want: 'mdy' },
    { locale: 'en-GB', want: 'dmy' },
    { locale: 'de-DE', want: 'dmy' },
    { locale: 'lt-LT', want: 'ymd' },
    { locale: 'ja-JP', want: 'ymd' },
  ]
  for (const c of cases)
    test(c.locale, () => {
      expect(localeOrder(c.locale)).toBe(c.want)
    })
})
