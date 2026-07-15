# Arquitetura de Agentes (runtime)

Orquestração **hierárquica (supervisor-worker)**, máx. **2 rodadas**. Não é swarm paralelo de 4
frontier: benchmark 2026 mostra que o hierárquico fica na fronteira de Pareto (F1 ~0.92 a ~1.4x
custo) e o fan-out puro sofre **falso-consenso** (agentes concordam com a maioria mesmo errada).
Roteamento + cache recuperam ~89% do ganho a ~1.15x do custo.

## Árvore

```
Cron → [1] dados (sem LLM) → [2] quant (sem LLM)
     → [3] fan-out: Research · Estrategista · RedTeam · Auditor
     → [4] validador numérico+fontes (código) → [5] comitê (scoring, código)
     → [6] Editor final → Morning Call → D1 + R2 + entrega
```

## Papéis e modelos (roteamento por criticidade)

| Agente           | Papel                                            | Modelo default                   | Saída              |
| ---------------- | ------------------------------------------------ | -------------------------------- | ------------------ |
| Research         | notícias/discursos/consenso, com fonte           | Gemini 3.1 Pro (Deep Research)   | `ResearchOutput`   |
| MacroStrategist  | regime, mapa causal, mispricing global           | GPT-5.6 / Opus 4.7               | `ThesisList`       |
| BrazilStrategist | fiscal, DI, câmbio, equities, crédito BR         | GPT-5.6 / Opus 4.7               | `ThesisList`       |
| Technical        | tendência/momentum/níveis (só sobre nº do quant) | GLM-5.2 / DeepSeek               | `TechnicalRead`    |
| Credit           | spreads, default, valor relativo                 | GPT-5.6 / Opus 4.7               | `CreditRead`       |
| TradeConstructor | tese → ficha de trade completa                   | GPT-5.6                          | `TradeCard[]`      |
| RedTeam          | destrói cada tese; aprova/rejeita/revisar        | Claude Opus 4.7 (≠ estrategista) | `RedTeamVerdict[]` |
| DataValidation   | campos faltantes, prob.=100%, frases vagas       | Kimi K2.6 (Workers AI)           | `ValidationReport` |
| FinalEditor      | monta o relatório (contrato editorial)           | GPT-5.6 / Opus 4.7               | `MorningCall`      |

Frontier só em estrategista/red team/editor. Técnico/auditoria/formatação → modelos baratos.

## Guardrails

- **Anti-ancoragem**: RedTeam recebe as fichas de trade, **não** o raciocínio do estrategista.
- **Anti-alucinação numérica**: nenhum número sem origem no quant ou fonte datada.
- **Loop**: limite 2 rodadas; timeout por agente; orçamento de tokens por run; log de custo.
- **Fornecedor fora do ar**: fallback de modelo no OpenRouter; dado que falha → seção `N/D`.

## APIs de modelo

- **OpenRouter** (camada principal, 1 chave): `POST https://openrouter.ai/api/v1/chat/completions`.
  Structured output: `response_format: {type:'json_schema', json_schema:{...}}` (schema estrito).
  Fallback: array `models: [...]` + `route:'fallback'` (tenta em ordem; provider failover é automático).
- **Workers AI** (Kimi barato): binding `env.AI.run("@cf/moonshotai/kimi-k2.6", { ... })`
  (confirmar a tag exata do modelo em developers.cloudflare.com/workers-ai/models — o exemplo dos
  docs usa `@cf/moonshotai/kimi-k2.5`). Aceita modelos `@cf/*` e terceiros `{autor}/{modelo}`.

## Comitê (scoring determinístico, código — sem LLM)

```
score = 0.25*fontes + 0.20*assimetria + 0.15*catalisador + 0.15*robustez_redteam
      + 0.10*liquidez + 0.10*independencia + 0.05*(1-custo_impl)
```

Passa só se: fontes verificadas, R:R mínimo, invalidação objetiva, sem divergência numérica,
aprovado no red team, liquidez compatível. Rejeitados são **registrados** (avaliação ao longo do tempo).
