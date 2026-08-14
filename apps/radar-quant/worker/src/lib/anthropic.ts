import type { RadarItem, SignalPlan, Regime } from '../types'
import type { SetupResult } from '@sz/analytics'

const PLAN_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    verdict: { type: 'string', enum: ['COMPRAR', 'AGUARDAR', 'VENDER'] },
    entry: { type: 'number' }, stop: { type: 'number' }, target1: { type: 'number' },
    target2: { type: ['number', 'null'] },
    conviction: { type: 'string', enum: ['ALTA', 'MEDIA', 'BAIXA'] },
    riskReward: { type: 'number' },
    indicatorsUsed: { type: 'array', items: { type: 'string' } },
    justification: { type: 'string' },
  },
  required: ['verdict', 'entry', 'stop', 'target1', 'target2', 'conviction', 'riskReward', 'indicatorsUsed', 'justification'],
}

export interface MacroCtx { ibovRegime: Regime; ibovScore: number | null; vixLast: number | null; vixRegime: Regime; usdbrlLast: number | null }

export function buildPrompt(item: RadarItem, macro: MacroCtx, setup: SetupResult): string {
  const m = item.metrics
  return `Você é um analista de swing trade da bolsa brasileira (B3). Avalie o ativo abaixo e produza um plano de operação swing (horizonte de dias a semanas).

ATIVO
- Símbolo: ${item.symbol}
- Nome: ${item.name}
- Último preço: ${item.last}
- Score: ${item.score} (faixa -100 a +100; positivo = viés comprador, negativo = vendedor)
- Regime: ${item.regime}
- Viés: ${item.bias.label} (${item.bias.strength})

MÉTRICAS
- Retorno 1d: ${m.ret_1d}%
- Retorno 5d: ${m.ret_5d}%
- Retorno 20d: ${m.ret_20d}%
- Retorno 60d: ${m.ret_60d}%
- Retorno 120d: ${m.ret_120d}%
- Posição no range de 60 dias: ${m.rangePos_60d}% (0 = mínima, 100 = máxima)
- Dias de alta nos últimos 5: ${m.upDays_5}

CONTEXTO MACRO
- IBOV regime: ${macro.ibovRegime}, score: ${macro.ibovScore ?? 'sem dado'}
- VIX último: ${macro.vixLast ?? 'sem dado'}, regime: ${macro.vixRegime}
- USDBRL último: ${macro.usdbrlLast ?? 'sem dado'}

CONDIÇÕES DO SETUP (motor de regras determinístico)
- Setup válido: ${setup.valid}
- Direção: ${setup.direction}
- Condições satisfeitas: ${setup.reasons.length ? setup.reasons.join(', ') : '(nenhuma)'}
- Condições não satisfeitas: ${setup.failed.length ? setup.failed.join(', ') : '(nenhuma)'}

INSTRUÇÕES
- Defina entry, stop e alvos coerentes com swing trade:
  - Stop entre -5% e -8% do preço de entrada (para LONG); espelhe para VENDER.
  - target1 entre +10% e +15%.
  - target2 entre +20% e +25%; use null se a convicção for BAIXA.
  - Calcule riskReward = (alvo1 - entry) / (entry - stop), em módulo.
- verdict COMPRAR quando o setup for válido e direção LONG; VENDER quando válido e direção SHORT.
- verdict AGUARDAR se o setup for inválido ou o score estiver em banda neutra (entre -15 e +15).
- conviction reflete a força do setup (quantas condições passaram, alinhamento macro).
- indicatorsUsed: liste os indicadores/métricas que sustentam a decisão.
- justification: 1 a 3 frases, em português, objetivo.
- Responda SOMENTE conforme o schema JSON especificado.`
}

export async function generatePlan(apiKey: string, prompt: string): Promise<SignalPlan> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    // RQ-25 (14/08/2026): sem timeout, uma chamada pendurada segurava o
    // worker ate o teto da plataforma.
    signal: AbortSignal.timeout(30_000),
    body: JSON.stringify({
      model: 'claude-haiku-4-5',
      max_tokens: 512,
      thinking: { type: 'disabled' },
      output_config: { format: { type: 'json_schema', schema: PLAN_SCHEMA } },
      messages: [{ role: 'user', content: prompt }],
    }),
  })
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`)
  const data = await res.json() as { content: Array<{ type: string; text?: string }> }
  const text = data.content.find(b => b.type === 'text')?.text ?? ''
  return JSON.parse(text) as SignalPlan
}
