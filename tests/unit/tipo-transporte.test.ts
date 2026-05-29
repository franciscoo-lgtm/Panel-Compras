import { describe, it, expect } from 'vitest'
import { detectTipoTransporte, slaThresholdDays } from '@/app/lib/comex-internals'

describe('detectTipoTransporte', () => {
  it('detects AIR from various prefixes', () => {
    expect(detectTipoTransporte('AIR 176')).toBe('AIR')
    expect(detectTipoTransporte('AIR-001')).toBe('AIR')
    expect(detectTipoTransporte('AIR_002')).toBe('AIR')
    expect(detectTipoTransporte('air 99')).toBe('AIR')
  })

  it('detects FCL from various prefixes', () => {
    expect(detectTipoTransporte('FCL 2206')).toBe('FCL')
    expect(detectTipoTransporte('FCL-1744')).toBe('FCL')
    expect(detectTipoTransporte('fcl 100')).toBe('FCL')
  })

  it('detects LCL as marítimo too', () => {
    expect(detectTipoTransporte('LCL 50')).toBe('LCL')
  })

  it('returns unknown for unrecognized prefixes', () => {
    expect(detectTipoTransporte('EMB-045')).toBe('unknown')
    expect(detectTipoTransporte('12345')).toBe('unknown')
    expect(detectTipoTransporte('')).toBe('unknown')
  })

  it('does not match partial prefix (AIRBUS would not be AIR)', () => {
    // AIRBUS empieza con "AIR" pero seguido de letra, no de separador
    expect(detectTipoTransporte('AIRBUS-123')).toBe('unknown')
  })
})

describe('slaThresholdDays', () => {
  it('AIR = 30 days', () => {
    expect(slaThresholdDays('AIR')).toBe(30)
  })

  it('FCL = 65 days', () => {
    expect(slaThresholdDays('FCL')).toBe(65)
  })

  it('LCL = 65 days (same as FCL)', () => {
    expect(slaThresholdDays('LCL')).toBe(65)
  })

  it('unknown defaults to 30 (conservador)', () => {
    expect(slaThresholdDays('unknown')).toBe(30)
  })
})
