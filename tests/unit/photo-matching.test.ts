import { describe, it, expect } from 'vitest'
import { fuzzyScore, tokens } from '@/app/lib/comex-internals'

describe('tokens', () => {
  it('lowercases and splits by whitespace', () => {
    expect(tokens('DJI Mini 4 Pro')).toEqual(['dji', 'mini', 'pro'])
  })

  it('strips non-alphanumeric chars', () => {
    expect(tokens('CP.MA.00000691.01')).toEqual(['00000691'])
  })

  it('filters tokens shorter than 3 chars', () => {
    expect(tokens('a bc def gh i')).toEqual(['def'])
  })

  it('handles empty string', () => {
    expect(tokens('')).toEqual([])
  })
})

describe('fuzzyScore', () => {
  it('returns 1.0 for identical strings', () => {
    expect(fuzzyScore('DJI Mini 4 Pro', 'DJI Mini 4 Pro')).toBe(1)
  })

  it('returns high score for similar descriptions', () => {
    const score = fuzzyScore('DJI Mini 4 Pro Combo', 'DJI Mini 4 Pro Fly More Combo')
    expect(score).toBeGreaterThanOrEqual(0.66)
  })

  it('returns 0 for completely different strings', () => {
    expect(fuzzyScore('battery', 'controller')).toBe(0)
  })

  it('returns 0 when either string is empty', () => {
    expect(fuzzyScore('', 'something')).toBe(0)
    expect(fuzzyScore('something', '')).toBe(0)
  })

  it('partial matches still count via substring', () => {
    // "mini" matches "minister" via includes
    const score = fuzzyScore('DJI Mini', 'DJI Minister Edition')
    expect(score).toBeGreaterThan(0)
  })

  it('case-insensitive', () => {
    expect(fuzzyScore('DJI MINI 4 PRO', 'dji mini 4 pro')).toBe(1)
  })
})
