import { Hono } from 'hono'
import { insertScan } from '../db/queries'
import { persistSignal } from '../lib/persist-signal'
import type { ScanDocument, OptimizationResult, OperatorSnapshot, SignalDocument } from '../types'

type Bindings = {
  DB: D1Database
  KV: KVNamespace
  INGEST_SECRET: string
  INGEST_HMAC_SECRET?: string
}

export const ingestRoutes = new Hono<{ Bindings: Bindings }>()

const MAX_BYTES = 1_048_576 // 1 MB

function encodeStr(s: string): Uint8Array {
  return new TextEncoder().encode(s)
}

async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  const ka = await crypto.subtle.importKey('raw', encodeStr(a), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sigA = await crypto.subtle.sign('HMAC', ka, encodeStr('compare'))
  const kb = await crypto.subtle.importKey('raw', encodeStr(b), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sigB = await crypto.subtle.sign('HMAC', kb, encodeStr('compare'))
  const ua = new Uint8Array(sigA), ub = new Uint8Array(sigB)
  let diff = 0
  for (let i = 0; i < ua.length; i++) diff |= ua[i] ^ ub[i]
  return diff === 0
}

async function verifyHmac(secret: string, signature: string, timestamp: string, body: string): Promise<boolean> {
  const now = Math.floor(Date.now() / 1000)
  const ts = parseInt(timestamp, 10)
  if (isNaN(ts) || Math.abs(now - ts) > 300) return false
  const key = await crypto.subtle.importKey(
    'raw', encodeStr(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  )
  const mac = await crypto.subtle.sign('HMAC', key, encodeStr(`${timestamp}.${body}`))
  const expected = Array.from(new Uint8Array(mac)).map(b => b.toString(16).padStart(2, '0')).join('')
  return signature === expected
}

// Middleware: auth + Content-Type
ingestRoutes.use('*', async (c, next) => {
  const auth = c.req.header('x-ingest-secret') ?? ''
  const secret = c.env.INGEST_SECRET
  const ok = await timingSafeEqual(auth, secret)
  if (!ok) return c.json({ error: 'Unauthorized' }, 401)

  if (c.req.method !== 'GET') {
    const ct = c.req.header('content-type') ?? ''
    if (!ct.includes('application/json')) return c.json({ error: 'Content-Type must be application/json' }, 415)
  }

  await next()
})

ingestRoutes.post('/scan', async (c) => {
  const buf = await c.req.arrayBuffer()
  if (buf.byteLength > MAX_BYTES) return c.json({ error: 'Payload too large (max 1MB)' }, 413)

  const bodyText = new TextDecoder().decode(buf)

  // HMAC opcional
  if (c.env.INGEST_HMAC_SECRET) {
    const sig = c.req.header('x-signature') ?? ''
    const ts = c.req.header('x-timestamp') ?? ''
    const valid = await verifyHmac(c.env.INGEST_HMAC_SECRET, sig, ts, bodyText)
    if (!valid) return c.json({ error: 'Invalid signature' }, 401)
  }

  let scan: ScanDocument
  try {
    scan = JSON.parse(bodyText) as ScanDocument
  } catch {
    return c.json({ error: 'Invalid JSON' }, 400)
  }

  // Validação de contrato mínima
  if (!scan.scanId || typeof scan.scanId !== 'string') return c.json({ error: 'Invalid payload: scanId required' }, 400)
  if (!scan.marketDate || !/^\d{4}-\d{2}-\d{2}$/.test(scan.marketDate)) return c.json({ error: 'Invalid payload: marketDate must be YYYY-MM-DD' }, 400)
  if (!Array.isArray(scan.items) || scan.items.length === 0) return c.json({ error: 'Invalid payload: items must be non-empty array' }, 400)

  await insertScan(c.env.DB, scan.scanId, scan.marketDate, scan.generatedAt, scan.schemaVersion, bodyText)
  return c.json({ ok: true })
})

ingestRoutes.post('/optimization', async (c) => {
  const buf = await c.req.arrayBuffer()
  if (buf.byteLength > MAX_BYTES) return c.json({ error: 'Payload too large' }, 413)
  const bodyText = new TextDecoder().decode(buf)
  let data: OptimizationResult[]
  try {
    data = JSON.parse(bodyText) as OptimizationResult[]
  } catch {
    return c.json({ error: 'Invalid JSON' }, 400)
  }
  if (!Array.isArray(data)) return c.json({ error: 'Expected array' }, 400)
  await c.env.KV.put('optimization:latest', bodyText)
  return c.json({ ok: true })
})

ingestRoutes.post('/operator', async (c) => {
  const buf = await c.req.arrayBuffer()
  if (buf.byteLength > 65_536) return c.json({ error: 'Payload too large' }, 413) // 64KB para snapshot
  const bodyText = new TextDecoder().decode(buf)
  let data: OperatorSnapshot
  try {
    data = JSON.parse(bodyText) as OperatorSnapshot
  } catch {
    return c.json({ error: 'Invalid JSON' }, 400)
  }
  if (!data.symbol || typeof data.symbol !== 'string') return c.json({ error: 'Invalid payload: symbol required' }, 400)
  await c.env.KV.put('operator:snapshot', JSON.stringify(data))
  return c.json({ ok: true })
})

ingestRoutes.post('/signal', async (c) => {
  const buf = await c.req.arrayBuffer()
  if (buf.byteLength > 65_536) return c.json({ error: 'Payload too large' }, 413) // 64KB
  const bodyText = new TextDecoder().decode(buf)

  // HMAC opcional (mesmo padrão de /scan)
  if (c.env.INGEST_HMAC_SECRET) {
    const sig = c.req.header('x-signature') ?? ''
    const ts = c.req.header('x-timestamp') ?? ''
    const valid = await verifyHmac(c.env.INGEST_HMAC_SECRET, sig, ts, bodyText)
    if (!valid) return c.json({ error: 'Invalid signature' }, 401)
  }

  let sig: SignalDocument
  try {
    sig = JSON.parse(bodyText) as SignalDocument
  } catch {
    return c.json({ error: 'Invalid JSON' }, 400)
  }

  if (!sig.signalId || typeof sig.signalId !== 'string') return c.json({ error: 'Invalid payload: signalId required' }, 400)
  if (!sig.symbol || typeof sig.symbol !== 'string') return c.json({ error: 'Invalid payload: symbol required' }, 400)
  if (sig.mode !== 'intraday' && sig.mode !== 'swing') return c.json({ error: 'Invalid payload: mode' }, 400)
  if (!sig.plan || !['COMPRAR', 'AGUARDAR', 'VENDER'].includes(sig.plan.verdict)) return c.json({ error: 'Invalid payload: plan.verdict' }, 400)
  if (!sig.marketDate || !/^\d{4}-\d{2}-\d{2}$/.test(sig.marketDate)) return c.json({ error: 'Invalid payload: marketDate must be YYYY-MM-DD' }, 400)
  if (!sig.generatedAt || typeof sig.generatedAt !== 'string') return c.json({ error: 'Invalid payload: generatedAt required' }, 400)

  await persistSignal(c.env, sig)

  return c.json({ ok: true, signalId: sig.signalId })
})
