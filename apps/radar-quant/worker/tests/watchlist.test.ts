import { describe, it, expect, beforeEach } from 'vitest'
import { Hono } from 'hono'
import { watchlistRoutes } from '../src/routes/watchlist'

type Bindings = { KV: KVNamespace }

function makeKv(): KVNamespace {
  const store = new Map<string, string>()
  return {
    get: (async (key: string) => store.get(key) ?? null) as KVNamespace['get'],
    put: (async (key: string, value: string) => {
      store.set(key, value)
    }) as KVNamespace['put'],
    delete: (async (key: string) => {
      store.delete(key)
    }) as KVNamespace['delete'],
  } as unknown as KVNamespace
}

function makeApp(kv: KVNamespace) {
  const app = new Hono<{ Bindings: Bindings }>()
  app.route('/', watchlistRoutes)
  return { app, env: { KV: kv } }
}

describe('watchlistRoutes', () => {
  let kv: KVNamespace

  beforeEach(() => {
    kv = makeKv()
  })

  it('lista vazia quando nada foi pedido ainda', async () => {
    const { app, env } = makeApp(kv)
    const res = await app.request('/', {}, env)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ symbols: [] })
  })

  it('adiciona um símbolo já com prefixo de bolsa', async () => {
    const { app, env } = makeApp(kv)
    const res = await app.request(
      '/',
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ symbol: 'COINBASE:BTCUSD' }) },
      env,
    )
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, symbols: ['COINBASE:BTCUSD'] })
  })

  it('normaliza símbolo sem prefixo para BMFBOVESPA', async () => {
    const { app, env } = makeApp(kv)
    const res = await app.request(
      '/',
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ symbol: 'petr4' }) },
      env,
    )
    expect(await res.json()).toEqual({ ok: true, symbols: ['BMFBOVESPA:PETR4'] })
  })

  it('não duplica símbolo já presente', async () => {
    const { app, env } = makeApp(kv)
    await app.request('/', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ symbol: 'PETR4' }) }, env)
    const res = await app.request('/', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ symbol: 'PETR4' }) }, env)
    expect(await res.json()).toEqual({ ok: true, symbols: ['BMFBOVESPA:PETR4'] })
  })

  it('rejeita payload sem symbol', async () => {
    const { app, env } = makeApp(kv)
    const res = await app.request('/', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({}) }, env)
    expect(res.status).toBe(400)
  })

  it('rejeita símbolo com caracteres inválidos', async () => {
    const { app, env } = makeApp(kv)
    const res = await app.request(
      '/',
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ symbol: 'NASDAQ:<script>' }) },
      env,
    )
    expect(res.status).toBe(400)
  })

  it('remove símbolo existente', async () => {
    const { app, env } = makeApp(kv)
    await app.request('/', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ symbol: 'PETR4' }) }, env)
    const res = await app.request(
      '/remove',
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ symbol: 'PETR4' }) },
      env,
    )
    expect(await res.json()).toEqual({ ok: true, symbols: [] })
  })

  it('bloqueia acima do limite de 50 símbolos', async () => {
    const { app, env } = makeApp(kv)
    const seeded = Array.from({ length: 50 }, (_, i) => `BMFBOVESPA:T${i}`)
    await kv.put('watchlist:requested', JSON.stringify(seeded))
    const res = await app.request(
      '/',
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ symbol: 'NOVO' }) },
      env,
    )
    expect(res.status).toBe(429)
  })
})
