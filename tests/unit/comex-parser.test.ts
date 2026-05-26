import { describe, it, expect } from 'vitest'
import { parseCSVRow, buildCsvUrl, splitCell, expandRowToShipments } from '@/app/lib/comex-internals'

describe('parseCSVRow', () => {
  it('parses simple comma-separated values', () => {
    expect(parseCSVRow('a,b,c')).toEqual(['a', 'b', 'c'])
  })

  it('respects quoted values with commas inside', () => {
    expect(parseCSVRow('"hello, world",foo,bar')).toEqual(['hello, world', 'foo', 'bar'])
  })

  it('handles empty values', () => {
    expect(parseCSVRow('a,,c')).toEqual(['a', '', 'c'])
  })

  it('trims whitespace and surrounding quotes', () => {
    expect(parseCSVRow(' "value" , other ')).toEqual(['value', 'other'])
  })
})

describe('buildCsvUrl', () => {
  it('builds gviz URL when sheetName is provided', () => {
    const url = buildCsvUrl('https://docs.google.com/spreadsheets/d/ABC123/edit', 'Tracking')
    expect(url).toBe('https://docs.google.com/spreadsheets/d/ABC123/gviz/tq?tqx=out:csv&sheet=Tracking')
  })

  it('builds export URL with gid when no sheetName', () => {
    const url = buildCsvUrl('https://docs.google.com/spreadsheets/d/ABC123/edit#gid=42')
    expect(url).toBe('https://docs.google.com/spreadsheets/d/ABC123/export?format=csv&gid=42')
  })

  it('defaults gid to 0 when missing', () => {
    const url = buildCsvUrl('https://docs.google.com/spreadsheets/d/ABC123/edit')
    expect(url).toBe('https://docs.google.com/spreadsheets/d/ABC123/export?format=csv&gid=0')
  })

  it('returns original URL when not a Google Sheets URL', () => {
    expect(buildCsvUrl('https://example.com/csv')).toBe('https://example.com/csv')
  })

  it('URL-encodes sheet name with spaces and special chars', () => {
    const url = buildCsvUrl('https://docs.google.com/spreadsheets/d/X/edit', 'My Sheet')
    expect(url).toContain('sheet=My%20Sheet')
  })
})

describe('splitCell', () => {
  it('splits by comma', () => {
    expect(splitCell('a,b,c')).toEqual(['a', 'b', 'c'])
  })

  it('trims spaces around each value', () => {
    expect(splitCell(' a , b , c ')).toEqual(['a', 'b', 'c'])
  })

  it('filters out empty strings', () => {
    expect(splitCell('a,,c,')).toEqual(['a', 'c'])
  })

  it('returns empty array for empty input', () => {
    expect(splitCell('')).toEqual([])
    expect(splitCell('   ')).toEqual([])
  })
})

describe('expandRowToShipments', () => {
  it('parses single embarque with no splits', () => {
    const errors: string[] = []
    const result = expandRowToShipments(
      'EMB-045',
      [{ fieldKey: 'etd', raw: '15/06/25' }],
      errors,
      'SO-1001',
    )
    expect(result).toEqual([
      { embarqueNo: 'EMB-045', extras: { etd: '15/06/25' } },
    ])
    expect(errors).toHaveLength(0)
  })

  it('splits N° Embarque comma-separated with parallel ETD/ETA', () => {
    const errors: string[] = []
    const result = expandRowToShipments(
      'EMB-045,EMB-046',
      [
        { fieldKey: 'etd', raw: '15/06/25,20/06/25' },
        { fieldKey: 'eta', raw: '28/06/25,02/07/25' },
      ],
      errors,
      'SO-1003',
    )
    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({
      embarqueNo: 'EMB-045',
      extras: { etd: '15/06/25', eta: '28/06/25' },
    })
    expect(result[1]).toEqual({
      embarqueNo: 'EMB-046',
      extras: { etd: '20/06/25', eta: '02/07/25' },
    })
    expect(errors).toHaveLength(0)
  })

  it('replicates single AWB across multiple embarques', () => {
    const errors: string[] = []
    const result = expandRowToShipments(
      'EMB-A,EMB-B,EMB-C',
      [{ fieldKey: 'awb', raw: '235-1234567' }],
      errors,
      'SO-X',
    )
    expect(result).toHaveLength(3)
    expect(result.every(s => s.extras.awb === '235-1234567')).toBe(true)
  })

  it('records warning when other column has fewer splits than embarques', () => {
    const errors: string[] = []
    const result = expandRowToShipments(
      'EMB-A,EMB-B,EMB-C',
      [{ fieldKey: 'etd', raw: '15/06,20/06' }],
      errors,
      'SO-X',
    )
    expect(result).toHaveLength(3)
    expect(result[2].extras.etd).toBe('20/06')  // takes last value
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('SO-X')
    expect(errors[0]).toContain('etd')
  })

  it('returns empty array when embarqueRaw is empty', () => {
    const errors: string[] = []
    expect(expandRowToShipments('', [], errors, 'SO-X')).toEqual([])
  })

  it('sets field to null when corresponding extra is empty', () => {
    const errors: string[] = []
    const result = expandRowToShipments(
      'EMB-A',
      [{ fieldKey: 'awb', raw: '' }],
      errors,
      'SO-X',
    )
    expect(result[0].extras.awb).toBeNull()
  })
})
