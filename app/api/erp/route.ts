import { NextRequest, NextResponse } from 'next/server'
import { gasGet, gasPost } from '@/app/lib/gas'

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const action = searchParams.get('action')
  if (!action) return NextResponse.json({ ok: false, error: 'action requerido' }, { status: 400 })

  const params: Record<string, string> = {}
  searchParams.forEach((v, k) => { if (k !== 'action') params[k] = v })

  try {
    const data = await gasGet(action, params)
    return NextResponse.json({ ok: true, data })
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const action = searchParams.get('action')
  if (!action) return NextResponse.json({ ok: false, error: 'action requerido' }, { status: 400 })

  try {
    const body = await req.json()
    const data = await gasPost(action, body)
    return NextResponse.json({ ok: true, data })
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 })
  }
}
