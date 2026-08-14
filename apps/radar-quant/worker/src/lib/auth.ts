// auth.ts — verificação de secret compartilhado (x-ingest-secret).
//
// RQ-20/RQ-21 (14/08/2026): as rotas /api/signals/generate e /api/watchlist
// eram públicas. Este middleware fecha as rotas que gastam dinheiro ou
// alteram estado, reusando o mesmo secret do ingest (fail-closed: sem
// INGEST_SECRET configurado, nega sempre).
import type { MiddlewareHandler } from 'hono'

export async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder()
  const ka = await crypto.subtle.importKey('raw', enc.encode(a), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sigA = await crypto.subtle.sign('HMAC', ka, enc.encode('compare'))
  const kb = await crypto.subtle.importKey('raw', enc.encode(b), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sigB = await crypto.subtle.sign('HMAC', kb, enc.encode('compare'))
  const ua = new Uint8Array(sigA)
  const ub = new Uint8Array(sigB)
  let diff = 0
  for (let i = 0; i < ua.length; i++) diff |= ua[i] ^ ub[i]
  return diff === 0
}

export const requireIngestSecret: MiddlewareHandler = async (c, next) => {
  const auth = c.req.header('x-ingest-secret') ?? ''
  const configured = c.env.INGEST_SECRET as string | undefined
  // Header vazio e chave vazia: importKey de chave zero-length lança
  // DataError, o que viraria 500. Negar antes.
  if (!auth || !configured) return c.json({ error: 'Unauthorized' }, 401)
  const ok = await timingSafeEqual(auth, configured)
  if (!ok) return c.json({ error: 'Unauthorized' }, 401)
  await next()
}
