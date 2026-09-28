import { describe, expect, test } from 'vitest'
import { monogram } from './glyph'

describe('monogram', () => {
  const cases: { name: string; want: string }[] = [
    { name: 'acme/go-tokenizer', want: 'GT' },
    { name: 'api', want: 'AP' },
    { name: 'x', want: 'X' },
    { name: 'acme/codeView', want: 'CV' },
    { name: 'acme/my_repo.v2', want: 'MR' },
    { name: 'acme/three-word-name', want: 'TW' },
    { name: 'acme/widgets.git', want: 'WI' },
    { name: 'acme/--dotfiles', want: 'DO' },
    { name: 'acme/42', want: '42' },
    { name: 'acme/élan-vital', want: 'ÉV' },
    { name: 'acme/---', want: '?' },
  ]
  for (const c of cases) {
    test(c.name, () => {
      expect(monogram(c.name)).toBe(c.want)
    })
  }
})
