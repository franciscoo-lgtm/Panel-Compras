# CIPL MVP — Design Spec
**Date:** 2026-05-10  
**Status:** Approved

## Overview
SaaS multiusuario para los equipos de Comercial y Comex de Bidcom. Permite cargar CIPLs (Commercial Invoice / Packing Lists) de repuestos (Excel) y mercadería DJI (PDF CI + PL), asignar Sales Orders, y hacer seguimiento aduanero.

## Auth
- NextAuth.js con proveedor Google OAuth
- Roles: `comercial` | `comex` | `admin`
- Todos los `CIPLItem` están vinculados al `userId` del usuario autenticado

## Flujo Comercial

### Repuestos (Excel)
1. Usuario sube Excel con hojas `CommercialInvoice` + `PackingList`
2. ETL extrae: ASN, Date, PI No., Case No., Qty, Code, Description, W/L/H, CBM, GW
3. Archivo se sube a Google Drive: `Compras DJI / AAAA / MMAAAA / N°PI / archivo.xlsx`
4. Usuario asigna SO Principal y SO Secundario por línea (datalist desde GSO V4)
5. Al guardar: sistema consulta GSO V4 y persiste SKU, PA, Modelo, Q_PI, FOB, Incoterm, Puerto Salida

### Mercadería (PDF CI + PDF PL)
1. Usuario sube dos PDF: Commercial Invoice + Packing List
2. ETL extrae del PL: ASN, Date, PI No., Q Bultos, Qty, EAN, Description, W/L/H, CBM, GW, CBM×Bulto, Uni×Bulto
3. IA detecta si el producto es Dangerous Good (isDangerousGood)
4. Archivos se suben a Drive: `Compras DJI / AAAA / MMAAAA / N°PI / ci.pdf + pl.pdf`
5. Mismo flujo SO + GSO V4 que Repuestos

## Schema de Base de Datos
Ver `prisma/schema.prisma` — DB: SQLite (`dev.db`)

### Modelos
| Modelo | Propósito |
|---|---|
| `User` | Usuarios autenticados con Google, campo `role` |
| `Account` / `Session` / `VerificationToken` | NextAuth estándar |
| `CIPLItem` | Registro central: campos ETL + usuario + GSO V4 + Comex tracking |
| `AppConfig` | Configuración clave-valor (GSO_V4_URL, etc.) |

### Grupos de campos de CIPLItem
- **Identidad**: `userId`, `tipoCarga`
- **ETL**: `asn`, `date`, `piNo`, `caseNo`, `qBultos`, `qty`, `codeEan`, `description`, `w`, `l`, `h`, `cbm`, `gwKg`, `cbmXBulto`, `uniXBulto`, `isDangerousGood`
- **Usuario**: `soPrincipal`, `soSecundario`, `linkMsds`
- **Drive**: `driveLinkExcel`, `driveLinkCi`, `driveLinkPl`
- **GSO V4**: `sku`, `pa`, `modelo`, `qPi`, `diferenciaPiPl`, `incoterm`, `puertoSalida`, `fobUnit`, `fobTotal`
- **Comex**: `avisoAgente`, `avisoConfirmacion`, `arriboWh`, `fotosAgente`, `paletizado`, `fechaInstruccion`, `confirmacionOk`, `etd`, `eta`, `etaCaldas`, `awb`

## Panel General
Dos vistas separadas: Repuestos / Mercadería. Columnas GSO V4 enriquecen la vista de Comercial. Columnas Comex completables por el equipo de Comex inline.
