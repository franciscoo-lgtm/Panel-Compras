// Shared constant — no 'use server' (not a server action file)

export const KNOWN_MAPPABLE_FIELDS = [
  { key: 'etd',              label: 'ETD',            type: 'date'   },
  { key: 'eta',              label: 'ETA',            type: 'date'   },
  { key: 'etaCaldas',        label: 'ETA Caldas',     type: 'date'   },
  { key: 'arriboWh',         label: 'Arribo WH',      type: 'date'   },
  { key: 'fechaInstruccion', label: 'F. Instrucción', type: 'date'   },
  { key: 'awb',              label: 'AWB',            type: 'string' },
  { key: 'avisoAgente',      label: 'Aviso Agente',   type: 'string' },
  { key: 'avisoConfirmacion',label: 'Conf. Agente',   type: 'string' },
  { key: 'fotosAgente',      label: 'Fotos Agente',   type: 'string' },
  { key: 'paletizado',       label: 'Paletizado',     type: 'string' },
  { key: 'confirmacionOk',   label: 'Conf. OK',       type: 'string' },
  { key: 'incoterm',         label: 'Incoterm',       type: 'string' },
  { key: 'puertoSalida',     label: 'Puerto Salida',  type: 'string' },
  { key: 'fobUnit',          label: 'FOB Unit',       type: 'number' },
  { key: 'fobTotal',         label: 'FOB Total',      type: 'number' },
  { key: 'qPi',              label: 'Q PI',           type: 'number' },
  { key: 'sku',              label: 'SKU',            type: 'string' },
  { key: 'pa',               label: 'PA / Marca',     type: 'string' },
  { key: 'modelo',           label: 'Modelo',         type: 'string' },
] as const
