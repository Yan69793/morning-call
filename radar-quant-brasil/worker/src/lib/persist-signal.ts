import { insertSignal } from '../db/queries'
import type { SignalDocument } from '../types'

type Env = { DB: D1Database; KV: KVNamespace }

export async function persistSignal(env: Env, doc: SignalDocument): Promise<void> {
  await insertSignal(env.DB, doc.signalId, doc.symbol, doc.mode, doc.plan.verdict, doc.marketDate, doc.generatedAt, JSON.stringify(doc))
  const prev = (await env.KV.get('signals:latest', 'json')) as SignalDocument[] | null
  const list = [doc, ...(prev ?? []).filter(s => s.signalId !== doc.signalId)].slice(0, 20)
  await env.KV.put('signals:latest', JSON.stringify(list))
}
