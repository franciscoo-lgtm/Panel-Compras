export const dynamic = 'force-dynamic'

import { listAllSOs } from '@/app/lib/sheets'
import { NuevaCompraClient } from './NuevaCompraClient'

export default async function NuevaCompraPage() {
  const soList = await listAllSOs()
  return <NuevaCompraClient soList={soList} />
}
