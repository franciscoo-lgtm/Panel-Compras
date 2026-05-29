import { describe, it, expect } from 'vitest'
import { parseDateLoose, deriveStatus, ESTADO_PRIORITY, pickField } from '@/app/lib/comex-internals'

describe('parseDateLoose', () => {
  it('parses ISO date strings', () => {
    expect(parseDateLoose('2026-05-15')?.toISOString().slice(0, 10)).toBe('2026-05-15')
  })

  it('parses DD/MM/YY format', () => {
    const d = parseDateLoose('15/06/25')
    expect(d?.getFullYear()).toBe(2025)
    expect(d?.getMonth()).toBe(5)  // June (0-indexed)
    expect(d?.getDate()).toBe(15)
  })

  it('parses DD/MM/YYYY format', () => {
    const d = parseDateLoose('15/06/2025')
    expect(d?.getFullYear()).toBe(2025)
  })

  it('handles 2-digit year correctly (adds 2000)', () => {
    const d = parseDateLoose('01/01/30')
    expect(d?.getFullYear()).toBe(2030)
  })

  it('returns null for null or empty input', () => {
    expect(parseDateLoose(null)).toBeNull()
    expect(parseDateLoose('')).toBeNull()
    expect(parseDateLoose(undefined)).toBeNull()
  })

  it('returns null for garbage input', () => {
    expect(parseDateLoose('not a date')).toBeNull()
    expect(parseDateLoose('99/99/99')).toBeNull()
  })
})

describe('ESTADO_PRIORITY', () => {
  it('has correct ordering', () => {
    expect(ESTADO_PRIORITY['arribado']).toBeGreaterThan(ESTADO_PRIORITY['en-transito'])
    expect(ESTADO_PRIORITY['en-transito']).toBeGreaterThan(ESTADO_PRIORITY['pendiente'])
    expect(ESTADO_PRIORITY['pendiente']).toBeGreaterThan(ESTADO_PRIORITY['desconocido'])
  })
})

describe('pickField', () => {
  it('finds field by partial key match (case-insensitive)', () => {
    const ship = { embarqueNo: 'EMB-1', extras: { 'ETD': '15/06/25', 'AWB': '123' } }
    expect(pickField(ship, ['etd'])).toBe('15/06/25')
  })

  it('returns null when no candidate matches', () => {
    const ship = { embarqueNo: 'EMB-1', extras: { 'foo': 'bar' } }
    expect(pickField(ship, ['etd'])).toBeNull()
  })

  it('skips null values even if key matches', () => {
    const ship = { embarqueNo: 'EMB-1', extras: { 'etd': null, 'ETD2': '15/06' } }
    expect(pickField(ship, ['etd'])).toBe('15/06')
  })
})

describe('deriveStatus', () => {
  const NOW = new Date('2026-06-01')

  it('returns "arribado" when fechaArriboDeposito is set (final = depósito argentino)', () => {
    const ship = {
      embarqueNo: 'EMB-1',
      extras: { etd: '15/05/26', fechaArriboDeposito: '20/05/26' },
    }
    expect(deriveStatus(ship, NOW)).toBe('arribado')
  })

  it('does NOT return "arribado" when only arriboWh (HK/Airsea) is set', () => {
    const ship = {
      embarqueNo: 'EMB-1',
      extras: { etd: '15/05/26', arriboWh: '20/05/26' },
    }
    // Arribo a WH intermedio NO es fin de proceso — embarque sigue en tránsito
    expect(deriveStatus(ship, NOW)).toBe('en-transito')
  })

  it('returns "en-transito" when ETD is past and no arrival', () => {
    const ship = {
      embarqueNo: 'EMB-1',
      extras: { etd: '15/05/26', eta: '28/05/26' },
    }
    expect(deriveStatus(ship, NOW)).toBe('en-transito')
  })

  it('returns "pendiente" when ETD is in the future', () => {
    const ship = {
      embarqueNo: 'EMB-1',
      extras: { etd: '15/07/26', eta: '28/07/26' },
    }
    expect(deriveStatus(ship, NOW)).toBe('pendiente')
  })

  it('returns "desconocido" when no ETD', () => {
    const ship = { embarqueNo: 'EMB-1', extras: {} }
    expect(deriveStatus(ship, NOW)).toBe('desconocido')
  })

  it('handles ETD exactly equal to now → en-transito', () => {
    const ship = { embarqueNo: 'EMB-1', extras: { etd: '01/06/26' } }
    expect(deriveStatus(ship, NOW)).toBe('en-transito')
  })
})
