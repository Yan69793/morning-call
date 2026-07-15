import { Hono } from 'hono'
import { getSignalById, getLatestScan } from '../db/queries'
import { persistSignal } from '../lib/persist-signal'
import { buildPrompt, generatePlan, type MacroCtx } from '../lib/anthropic'
import { evaluateSwingSetup } from '@sz/analytics'
import type { ScanDocument, SignalDocument, Regime } from '../types'

type Bindings = { DB: D1Database; KV: KVNamespace; ANTHROPIC_API_KEY: string }
export const signalRoutes = new Hono<{ Bindings: Bindings }>()

// Lista os últimos sinais (cache KV). Array vazio se não houver nenhum.
signalRoutes.get('/latest', async (c) => {
  const data = await c.env.KV.get('signals:latest', 'json')
  return c.json(data ?? [])
})

// Gera um novo sinal swing (motor de regras + Haiku) e persiste.
signalRoutes.post('/generate', async (c) => {
  let body: { symbol?: string }
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid JSON' }, 400)
  }
  const symbol = body.symbol
  if (!symbol || typeof symbol !== 'string') return c.json({ error: 'symbol required' }, 400)

  if (!c.env.ANTHROPIC_API_KEY) return c.json({ error: 'ANTHROPIC_API_KEY not configured' }, 503)

  // Rate limit: cooldown por símbolo (60s) e cap diário (200)
  const cooldownKey = `gen:cooldown:${symbol}`
  if (await c.env.KV.get(cooldownKey)) return c.json({ error: 'cooldown' }, 429)
  const today = new Date().toISOString().slice(0, 10)
  const countKey = `gen:count:${today}`
  const count = parseInt((await c.env.KV.get(countKey)) ?? '0', 10) || 0
  if (count >= 200) return c.json({ error: 'daily limit' }, 429)

  // Carrega o scan mais recente e localiza o item
  const scanRow = await getLatestScan(c.env.DB)
  if (!scanRow) return c.json({ error: 'no scan available' }, 404)
  const scan = JSON.parse(scanRow.payload) as ScanDocument
  const item = scan.items.find(i => i.symbol === symbol)
  if (!item) return c.json({ error: 'symbol not found in latest scan' }, 404)

  // Constrói o contexto macro a partir dos itens do scan, com fallbacks
  const ibov = scan.items.find(i => (i.type === 'indice' || i.kind === 'indice') && i.symbol.includes('IBOV'))
  const vix = scan.items.find(i => i.type === 'vix')
  const usdbrl = scan.items.find(i => i.symbol.includes('USDBRL'))

  const ibovRegime: Regime = ibov?.regime ?? 'NEUTRO'
  const ibovScore = ibov?.score ?? 0
  const vixLast = vix?.last ?? 0
  const vixRegime: Regime = vix?.regime ?? 'NEUTRO'
  const usdbrlLast = usdbrl?.last ?? 0

  const setup = evaluateSwingSetup({
    score: item.score,
    regime: item.regime,
    ret_20d: item.metrics.ret_20d,
    rangePos_60d: item.metrics.rangePos_60d,
    upDays_5: item.metrics.upDays_5,
    ibovScore,
    vixRiscoOff: vixLast >= 25,
    symbolError: item.quality.symbolError,
  })

  const macro: MacroCtx = { ibovRegime, ibovScore, vixLast, vixRegime, usdbrlLast }

  let plan
  try {
    const prompt = buildPrompt(item, macro, setup)
    plan = await generatePlan(c.env.ANTHROPIC_API_KEY, prompt)
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    return c.json({ error: 'generation failed', detail }, 502)
  }

  const generatedAt = new Date().toISOString()
  const doc: SignalDocument = {
    signalId: `${generatedAt}-${symbol.split(':')[1] ?? symbol}-swing`,
    schemaVersion: '1.0.0',
    symbol,
    name: item.name,
    mode: 'swing',
    marketDate: scan.marketDate,
    generatedAt,
    plan,
    setupReasons: setup.reasons,
    macro: { ibovRegime, ibovScore, vixLast, vixRegime, usdbrlLast },
  }

  await persistSignal(c.env, doc)

  // Marca cooldown e incrementa o contador diário
  await c.env.KV.put(cooldownKey, '1', { expirationTtl: 60 })
  await c.env.KV.put(countKey, String(count + 1), { expirationTtl: 172800 })

  return c.json(doc)
})

// Um sinal específico por id (D1).
signalRoutes.get('/:id', async (c) => {
  const row = await getSignalById(c.env.DB, c.req.param('id'))
  if (!row) return c.json({ error: 'Signal not found' }, 404)
  return c.json(JSON.parse(row.payload))
})
