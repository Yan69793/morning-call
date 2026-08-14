// Regressão de segurança das rotas de escrita (RQ-20/RQ-21, 14/08/2026).
import { describe, it, expect } from 'vitest'
import app from '../src/index'

function makeKV(): KVNamespace {
  const store = new Map<string, string>()
  return {
    get: async (k: string) => store.get(k) ?? null,
    put: async (k: string, v: string) => { store.set(k, v) },
  } as unknown as KVNamespace
}

const env = {
  DB: {} as D1Database,
  KV: makeKV(),
  INGEST_SECRET: 's3',
  ANTHROPIC_API_KEY: '',
} as unknown as Record<string, unknown>

describe('auth nas rotas que gastam ou alteram estado', () => {
  it('POST /api/signals/generate sem secret -> 401', async () => {
    const res = await app.request(
      '/api/signals/generate',
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ symbol: 'PETR4' }) },
      env,
    )
    expect(res.status).toBe(401)
  })

  it('POST /api/signals/generate com secret errado -> 401', async () => {
    const res = await app.request(
      '/api/signals/generate',
      { method: 'POST', headers: { 'content-type': 'application/json', 'x-ingest-secret': 'errado' }, body: JSON.stringify({ symbol: 'PETR4' }) },
      env,
    )
    expect(res.status).toBe(401)
  })

  it('POST /api/signals/generate com secret correto passa do middleware', async () => {
    // Sem ANTHROPIC_API_KEY a rota devolve 503, o que prova que o
    // middleware de auth deixou a requisicao chegar ao handler.
    const res = await app.request(
      '/api/signals/generate',
      { method: 'POST', headers: { 'content-type': 'application/json', 'x-ingest-secret': 's3' }, body: JSON.stringify({ symbol: 'PETR4' }) },
      env,
    )
    expect(res.status).toBe(503)
  })

  it('POST /api/watchlist sem secret -> 401', async () => {
    const res = await app.request(
      '/api/watchlist',
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ symbol: 'PETR4' }) },
      env,
    )
    expect(res.status).toBe(401)
  })

  it('POST /api/watchlist com secret -> 200', async () => {
    const res = await app.request(
      '/api/watchlist',
      { method: 'POST', headers: { 'content-type': 'application/json', 'x-ingest-secret': 's3' }, body: JSON.stringify({ symbol: 'PETR4' }) },
      env,
    )
    expect(res.status).toBe(200)
  })

  it('GET /api/watchlist continua publico', async () => {
    const res = await app.request('/api/watchlist', { method: 'GET' }, env)
    expect(res.status).toBe(200)
  })
})
