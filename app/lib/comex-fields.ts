// Shared constant — no 'use server' (not a server action file)

export const JOINABLE_FIELDS = [
  { key: 'so',         label: 'SO (número de orden)'   },
  { key: 'asn',        label: 'ASN (número de envío)'  },
  { key: 'piNo',       label: 'N° PI / Invoice'         },
  { key: 'embarqueNo', label: 'N° Embarque'             },
] as const
export type JoinField = typeof JOINABLE_FIELDS[number]['key']

// Fields that are NOT native CIPLItem properties — their value must be looked up
// from liveData before using them as a secondary join key.
export const LIVE_JOIN_FIELDS: JoinField[] = ['embarqueNo']

export const KNOWN_MAPPABLE_FIELDS = [
  { key: 'etd',                  label: 'ETD',              type: 'date'   },
  { key: 'eta',                  label: 'ETA',              type: 'date'   },
  { key: 'etaCaldas',            label: 'ETA Caldas',       type: 'date'   },
  { key: 'arriboWh',             label: 'Arribo WH',        type: 'date'   },
  { key: 'fechaArriboAduana',    label: 'Arribo Aduana',    type: 'date'   },
  { key: 'fechaArriboDeposito',  label: 'Arribo Depósito',  type: 'date'   },
  { key: 'embarqueNo',           label: 'N° Embarque',      type: 'string' },
  { key: 'fechaInstruccion',     label: 'F. Instrucción',   type: 'date'   },
  { key: 'awb',                  label: 'AWB',              type: 'string' },
  { key: 'avisoAgente',          label: 'Aviso Agente',     type: 'string' },
  { key: 'avisoConfirmacion',    label: 'Conf. Agente',     type: 'string' },
  { key: 'fotosAgente',          label: 'Fotos Agente',     type: 'string' },
  { key: 'paletizado',           label: 'Paletizado',       type: 'string' },
  { key: 'confirmacionOk',       label: 'Conf. OK',         type: 'string' },
  { key: 'incoterm',             label: 'Incoterm',         type: 'string' },
  { key: 'puertoSalida',         label: 'Puerto Salida',    type: 'string' },
  { key: 'fobUnit',              label: 'FOB Unit',         type: 'number' },
  { key: 'fobTotal',             label: 'FOB Total',        type: 'number' },
  { key: 'qPi',                  label: 'Q PI',             type: 'number' },
  { key: 'sku',                  label: 'SKU',              type: 'string' },
  { key: 'pa',                   label: 'PA / Marca',       type: 'string' },
  { key: 'modelo',               label: 'Modelo',           type: 'string' },
] as const

export type KnownFieldKey = typeof KNOWN_MAPPABLE_FIELDS[number]['key']

// Fields that are Compra logistics milestones (come from Comex sources)
export const COMPRA_COMEX_MILESTONE_FIELDS: Array<{ fieldKey: string; label: string; type: 'date' | 'string' }> = [
  { fieldKey: 'embarqueNo',          label: 'N° Embarque',            type: 'string' },
  { fieldKey: 'awb',                 label: 'AWB / BL',               type: 'string' },
  { fieldKey: 'fechaInstruccion',    label: 'F. Instrucción',         type: 'date'   },
  { fieldKey: 'etd',                 label: 'ETD',                    type: 'date'   },
  { fieldKey: 'eta',                 label: 'ETA',                    type: 'date'   },
  { fieldKey: 'etaCaldas',           label: 'ETA Caldas',             type: 'date'   },
  { fieldKey: 'arriboWh',            label: 'Arribo WH',              type: 'date'   },
  { fieldKey: 'fechaArriboAduana',   label: 'Arribo Aduana',          type: 'date'   },
  { fieldKey: 'fechaArriboDeposito', label: 'Arribo Depósito',        type: 'date'   },
  { fieldKey: 'avisoAgente',         label: 'Aviso Agente',           type: 'string' },
  { fieldKey: 'avisoConfirmacion',   label: 'Conf. Agente',           type: 'string' },
  { fieldKey: 'confirmacionOk',      label: 'Conf. OK',               type: 'string' },
]
