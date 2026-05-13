import * as XLSX from 'xlsx'

export type ExportItem = {
  isDangerousGood: boolean
  categoryName:    string | null
  piNo:            string | null
  caseNo:          string | null
  qBultos:         number | null
  qty:             number | null
  description:     string | null
  w:               number | null
  l:               number | null
  h:               number | null
  cbm:             number | null
  gwKg:            number | null
  cbmXBulto:       number | null
  uniXBulto:       number | null
  soPrincipal:     string | null
  sku:             string | null
  pa:              string | null
  incoterm:        string | null
  driveLinkPl:     string | null
  driveLinkExcel:  string | null
}

const RED    = { patternType: 'solid' as const, fgColor: { rgb: 'FFFF0000' }, bgColor: { rgb: 'FFFF0000' } }
const YELLOW = { patternType: 'solid' as const, fgColor: { rgb: 'FFFFFF00' }, bgColor: { rgb: 'FFFFFF00' } }
const GREEN  = { patternType: 'solid' as const, fgColor: { rgb: 'FF00FF00' }, bgColor: { rgb: 'FF00FF00' } }
const BOLD   = { bold: true, sz: 10 }

const HEADERS: [string, typeof RED][] = [
  ['Dangerous Goods',             RED   ],
  ['Item',                        YELLOW],
  ['Supplier',                    YELLOW],
  ['FACTORY ADDRESS',             YELLOW],
  ['Contact Name',                YELLOW],
  ['Phone Number',                YELLOW],
  ['e-mail',                      YELLOW],
  ['Order Number',                YELLOW],
  ['INCOTERM',                    YELLOW],
  ['PALLET or Container Number',  GREEN ],
  ['SO-NUMBER',                   GREEN ],
  ['Bidcom Internal Code',        YELLOW],
  ['CTNS',                        YELLOW],
  ['DESCRIPTION',                 YELLOW],
  ['Quantity Per Carton',         YELLOW],
  ['TOTAL',                       YELLOW],
  ['Weight/CTN (kg/CTN)',         YELLOW],
  ['Dimension (cm)',              YELLOW],
  ['',                            YELLOW],
  ['',                            YELLOW],
  ['TOTAL CBM (M3)',              YELLOW],
  ['TOTAL WEIGHT (kg)',           YELLOW],
  ['M3 por Bulto',                YELLOW],
  ['Kg* Bulto Deposito',          YELLOW],
  ['PL Original',                 YELLOW],
  ['Comments',                    GREEN ],
  ['Fecha Prioritaria',           GREEN ],
  ['PA',                          YELLOW],
]

function cell(v: XLSX.CellObject['v'], t: XLSX.CellObject['t'], fill?: object): XLSX.CellObject {
  return { v, t, s: fill ? { fill, font: BOLD, alignment: { wrapText: false } } : undefined } as XLSX.CellObject
}
function hdr(v: string, fill: object): XLSX.CellObject {
  return { v, t: 's', s: { fill, font: BOLD, alignment: { horizontal: 'center', wrapText: true } } } as XLSX.CellObject
}

export function buildCiplWorkbook(items: ExportItem[]): XLSX.WorkBook {
  const wb = XLSX.utils.book_new()
  const ws: XLSX.WorkSheet = {}
  const NC = HEADERS.length // 28

  // Row 0: main headers
  HEADERS.forEach(([label, fill], c) => {
    ws[XLSX.utils.encode_cell({ r: 0, c })] = hdr(label, fill)
  })

  // Row 1: sub-headers (W, L, H only)
  for (let c = 0; c < NC; c++) {
    const v = c === 17 ? 'W' : c === 18 ? 'L' : c === 19 ? 'H' : ''
    ws[XLSX.utils.encode_cell({ r: 1, c })] = hdr(v, YELLOW)
  }

  // Assign box numbers by unique caseNo
  const boxNums = new Map<string, number>()
  let boxCounter = 0
  items.forEach((item, i) => {
    const key = item.caseNo ?? `__none_${i}`
    if (!boxNums.has(key)) boxNums.set(key, ++boxCounter)
  })

  // Data rows
  let sumQty = 0, sumCbm = 0, sumGw = 0, sumWtctn = 0

  items.forEach((item, i) => {
    const r       = i + 2
    const boxNum  = boxNums.get(item.caseNo ?? `__none_${i}`) ?? i + 1
    const wtPerCtn = item.gwKg != null && item.qBultos ? item.gwKg / item.qBultos : (item.gwKg ?? 0)

    sumQty   += item.qty  ?? 0
    sumCbm   += item.cbm  ?? 0
    sumGw    += item.gwKg ?? 0
    sumWtctn += wtPerCtn

    const row: XLSX.CellObject[] = [
      cell(item.isDangerousGood ? 'X' : '', 's'),
      cell(boxNum, 'n'),
      cell(item.categoryName ?? '', 's'),
      cell('', 's'),
      cell('', 's'),
      cell('', 's'),
      cell('', 's'),
      cell(item.piNo ?? '', 's'),
      cell(item.incoterm ?? '', 's'),
      cell(item.caseNo ?? '', 's'),
      cell(item.soPrincipal ?? '', 's'),
      cell(item.sku ?? '', 's'),
      item.qBultos != null ? cell(item.qBultos, 'n') : cell('', 's'),
      cell(item.description ?? '', 's'),
      item.uniXBulto != null ? cell(item.uniXBulto, 'n') : cell('', 's'),
      item.qty != null ? cell(item.qty, 'n') : cell('', 's'),
      cell(+wtPerCtn.toFixed(4), 'n'),
      item.w != null ? cell(item.w, 'n') : cell('', 's'),
      item.l != null ? cell(item.l, 'n') : cell('', 's'),
      item.h != null ? cell(item.h, 'n') : cell('', 's'),
      item.cbm != null ? cell(item.cbm, 'n') : cell('', 's'),
      item.gwKg != null ? cell(item.gwKg, 'n') : cell('', 's'),
      item.cbmXBulto != null ? cell(item.cbmXBulto, 'n') : cell('', 's'),
      cell(+wtPerCtn.toFixed(4), 'n'),
      cell(item.driveLinkPl ?? item.driveLinkExcel ?? '', 's'),
      cell('', 's'),
      cell('', 's'),
      cell(item.pa ?? '', 's'),
    ]

    row.forEach((c2, c) => { ws[XLSX.utils.encode_cell({ r, c })] = c2 })
  })

  // Total row
  const tr = items.length + 2
  for (let c = 0; c < NC; c++) {
    ws[XLSX.utils.encode_cell({ r: tr, c })] = { v: '', t: 's', s: { fill: YELLOW, font: BOLD } } as XLSX.CellObject
  }
  ws[XLSX.utils.encode_cell({ r: tr, c: 0  })] = { v: 'Total',               t: 's', s: { fill: YELLOW, font: BOLD } } as XLSX.CellObject
  ws[XLSX.utils.encode_cell({ r: tr, c: 10 })] = { v: +sumQty.toFixed(0),    t: 'n', s: { fill: YELLOW, font: BOLD } } as XLSX.CellObject
  ws[XLSX.utils.encode_cell({ r: tr, c: 16 })] = { v: +sumWtctn.toFixed(4),  t: 'n', s: { fill: YELLOW, font: BOLD } } as XLSX.CellObject
  ws[XLSX.utils.encode_cell({ r: tr, c: 17 })] = { v: +sumCbm.toFixed(5),    t: 'n', s: { fill: YELLOW, font: BOLD } } as XLSX.CellObject
  ws[XLSX.utils.encode_cell({ r: tr, c: 21 })] = { v: +sumGw.toFixed(3),     t: 'n', s: { fill: YELLOW, font: BOLD } } as XLSX.CellObject

  // Merges
  const merges: XLSX.Range[] = []
  // Header: vertical merges (rows 0+1) for all columns except R,S,T
  ;[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,20,21,22,23,24,25,26,27].forEach(c =>
    merges.push({ s: { r: 0, c }, e: { r: 1, c } })
  )
  // Header: horizontal merge for Dimension (R,S,T in row 0)
  merges.push({ s: { r: 0, c: 17 }, e: { r: 0, c: 19 } })
  // Total row merges
  merges.push({ s: { r: tr, c: 0  }, e: { r: tr, c: 9  } }) // A–J: "Total"
  merges.push({ s: { r: tr, c: 10 }, e: { r: tr, c: 15 } }) // K–P: sum qty
  merges.push({ s: { r: tr, c: 17 }, e: { r: tr, c: 20 } }) // R–U: sum CBM
  merges.push({ s: { r: tr, c: 22 }, e: { r: tr, c: 27 } }) // W–AB: empty

  ws['!merges'] = merges
  ws['!ref']    = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: tr, c: NC - 1 } })
  ws['!cols']   = [
    {wch:18},{wch:6},{wch:26},{wch:50},{wch:14},{wch:14},{wch:22},
    {wch:18},{wch:12},{wch:26},{wch:14},{wch:16},{wch:8},{wch:50},
    {wch:10},{wch:10},{wch:14},{wch:8},{wch:8},{wch:8},{wch:14},
    {wch:16},{wch:12},{wch:14},{wch:40},{wch:14},{wch:14},{wch:18},
  ]

  XLSX.utils.book_append_sheet(wb, ws, 'PL Consolidado Mercaderia')
  return wb
}

export function workbookToBase64(wb: XLSX.WorkBook): string {
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx', cellStyles: true })
  return Buffer.from(buf).toString('base64')
}
