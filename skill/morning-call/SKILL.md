---
name: morning-call
description: >-
  Sistema que gera diariamente um Morning Call multimercados (Brasil + global) para gestores,
  UHNW e family offices, rodando como Cloudflare Worker (extensão do VixRadar). Use SEMPRE que
  o usuário: (1) pedir para gerar, montar, revisar ou estruturar um Morning Call, pregão,
  briefing macro ou nota de estratégia multimercados; (2) trabalhar no sistema Morning Call —
  Worker, orquestração de agentes, camada de dados, motor quant, schemas, deploy Cloudflare;
  (3) precisar de dados financeiros reais e datados (BCB/SGS, Focus, PTAX, B3, ANBIMA, Tesouro,
  FRED, US Treasury, câmbio, commodities, cripto) ou seus endpoints/rate limits; (4) definir
  roteamento de modelos (OpenRouter, Workers AI/Kimi), red team, comitê ou avaliação de teses;
  (5) propor operações com entrada, alvo, invalidação, catalisador, hedge e sizing. Também com:
  morning call, pregão, Motor de Oportunidades, curva DI, erro de precificação, regime macro,
  rastreabilidade N/D.
---

# Morning Call

Sistema que transforma cenário macro em **operações executáveis, condicionais, rastreáveis e
disciplinadas por risco** — todos os dias, antes da abertura. Roda como Cloudflare Worker
(TypeScript), estendendo a infra do VixRadar (Workers/KV/D1/R2 + OpenRouter).

> **Regra inegociável:** este sistema gera teses auditáveis. **Nunca executa ordens, move
> dinheiro ou dispara trades.**

## Princípio central (leia antes de tudo)

**O gargalo são os DADOS, não os modelos.** LLMs interpretam números — **nunca os produzem**.
Todo cálculo relevante é feito em código testado. Todo dado carrega `source` + `timestamp` +
`as_of`. Dado sem fonte confiável vira `N/D — REQUER VERIFICAÇÃO`, nunca é inventado. Recuse
otimização prematura de orquestração ou de escolha de modelo enquanto a camada de dados não
estiver sólida.

## Fluxo diário (o que o sistema faz)

```
Cron 06:30 BRT
  → [1] Coleta determinística de dados        (sem LLM)   → references/data-sources.md
  → [2] Motor quantitativo                     (sem LLM)   → references/quant-formulas.md
  → [3] Agentes (fan-out): Research · Estrategista · RedTeam · Auditor
  → [4] Validador numérico + de fontes         (código)
  → [5] Comitê de investimento (scoring)       (código)
  → [6] Editor final monta o relatório                     → references/editorial-contract.md
  → Morning Call + trades → D1 (histórico) + R2 (relatório) + entrega
```

Arquitetura de agentes, modelos por papel e guardrails anti-alucinação:
ver **references/agent-architecture.md**.

## Como usar esta skill

> **O repositório é a fonte de verdade, não esta pasta.** Onde houver divergência entre um arquivo
> daqui e o repositório, o repositório vence. Esta regra existe porque a alternativa já falhou:
> `assets/trade_card.schema.json` foi escrito à mão com `entrada: number` e ficou meses divergindo
> do `src/schemas/trade.ts`, que discrimina por forma de entrada (AD-6), sem ninguém notar.

Escolha a tarefa e leia a referência correspondente (progressive disclosure — não carregue tudo):

- **Buscar/definir dados reais** (BCB, Focus, PTAX, B3, ANBIMA, Tesouro, FRED, US Treasury,
  mercado, cripto): leia **`docs/DATA_SOURCES.md`** na raiz do repositório — é a matriz canônica,
  com endpoints testados ao vivo e exemplos `curl`. Para buscar de fato, use `scripts/fetch_data.py`.
- **Calcular métricas** (retornos, vol, drawdown, z-score, correlação, inclinação de curva,
  breakeven, risco-retorno): o motor que roda em produção é **`packages/analytics`** (TypeScript,
  compartilhado com o Radar Quant Brasil) e **`apps/morning-call/src/quant`**. O `scripts/quant.py`
  daqui é oráculo de referência para conferir o TS, não implementação a ser usada em produção.
  **Nunca peça número a um LLM.**
- **Montar/rever o relatório** (seções, ficha de trade, ranking, rastreabilidade):
  leia `references/editorial-contract.md`. O schema da ficha de trade está em
  `assets/trade_card.schema.json` — **gerado** a partir de `src/schemas/trade.ts` por
  `npm run gen:schema -w @sz/morning-call`. Não editar à mão; regerar.
- **Orquestrar agentes / rotear modelos / red team / comitê**: leia `docs/RUNTIME_AGENTS.md` na
  raiz. O `references/agent-architecture.md` daqui é resumo, e o v1 roda 4 agentes, não 9.

## Regras absolutas (aplicam-se a qualquer tarefa)

1. Não invente cotação, fonte, endpoint, credencial, consenso, fluxo, suporte, resistência,
   spread, posição ou probabilidade. Sem fonte → `N/D — REQUER VERIFICAÇÃO`.
2. Cálculo financeiro relevante = código testado. LLM só interpreta.
3. Cada etapa devolve JSON validado contra os schemas. Sem JSON válido, a etapa falha.
4. Sistema degrada com segurança: falha parcial gera seção `N/D`, nunca relatório falso.
5. Nunca exponha chaves (`.dev.vars` local / `wrangler secret` em prod). Deploy é ação humana.
6. Toda ficha de trade precisa de entrada, alvo, invalidação, catalisador, sizing (% do
   orçamento de risco) e fonte. Faltou um campo → o trade não passa.
7. Se não houver assimetria, escreva: **"NÃO OPERAR É A MELHOR OPERAÇÃO"**. Não force trades.

## Stack (decidida)

Cloudflare Workers (TS) · Cron Trigger · KV (cache) · D1 (teses/trades/avaliação) · R2
(relatórios) · OpenRouter (GPT-5.6, Gemini 3.1 Pro, Claude Opus 4.7, GLM-5.2, DeepSeek V4) ·
Kimi K2.6 via Workers AI para tarefas agênticas baratas. Quant em TypeScript puro. Vitest.
Orquestração **hierárquica** (supervisor-worker, máx. 2 rodadas), **não** swarm paralelo de 4
frontier — evita falso-consenso e melhora custo-benefício.
