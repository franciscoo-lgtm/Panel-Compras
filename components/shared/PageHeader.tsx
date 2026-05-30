import { ReactNode } from 'react'

type Props = {
  eyebrow: string                    // tag superior pequeño en uppercase
  title: string                      // titular display
  description?: string               // sub-descripción opcional
  meta?: ReactNode                   // contenido a la derecha del eyebrow (ej: mes, contador, fecha)
  action?: ReactNode                 // botón principal (ej: "Nueva Compra")
  className?: string
}

/**
 * Header editorial premium para todas las pantallas del panel.
 * Usa el lenguaje visual establecido en el home: eyebrow, display titular,
 * hairline con fade. Mantiene consistencia entre /embarques, /compras,
 * /comercial, /configuracion.
 */
export function PageHeader({ eyebrow, title, description, meta, action, className = '' }: Props) {
  return (
    <header className={`mb-10 fade-rise ${className}`}>
      <div className="flex items-baseline justify-between mb-3 gap-4">
        <span className="eyebrow">{eyebrow}</span>
        {meta && <span className="eyebrow tabular-nums">{meta}</span>}
      </div>
      <div className="flex items-end justify-between gap-6 flex-wrap">
        <h1 className="display-md text-white">{title}</h1>
        {action}
      </div>
      {description && (
        <p className="mt-3 text-[13px] text-white/45 max-w-2xl leading-relaxed">
          {description}
        </p>
      )}
      <div className="hairline mt-7" />
    </header>
  )
}
