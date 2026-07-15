# CLAUDE.md — Instruções Globais do Projeto Morning Call

> Este arquivo é o ponto de entrada para **qualquer agente de código** (Claude Code, Codex,
> Gemini CLI, ZCode). Leia-o inteiro antes de tocar em qualquer arquivo. As regras aqui são
> absolutas e prevalecem sobre conveniência, velocidade ou "boas práticas genéricas".
>
> Documentos irmãos: `AGENTS.md` (agentes de runtime), `ARCHITECTURE.md` (arquitetura decidida),
> `IMPLEMENTATION_PLAN.md` (fases), `MORNING_CALL_OTIMIZADO.md` (contrato editorial),
> `docs/DATA_SOURCES.md` (o gargalo real).

---

## 1. O QUE ESTAMOS CONSTRUINDO

Um sistema profissional de inteligência de mercado que gera **diariamente** um Morning Call
multimercados (Brasil + global) para gestores, UHNW e family offices. O sistema:

1. Coleta dados financeiros reais, datados e verificáveis (camada determinística).
2. Calcula métricas quantitativas **em código** (nunca por memória de LLM).
3. Pesquisa notícias/eventos com fonte rastreável.
4. Identifica regime macro e **erros de precificação**.
5. Propõe 3–7 operações executáveis com entrada, alvo, invalidação, catalisador, hedge e sizing.
6. Submete cada tese a um **red team** independente.
7. Valida números e fontes antes de publicar.
8. Armazena teses/trades para avaliação posterior (skill of the model over time).
9. Gera um relatório final rastreável (ver `MORNING_CALL_OTIMIZADO.md`).

**Este sistema gera teses auditáveis. NUNCA executa ordens, move dinheiro ou dispara trades.**

---

## 2. STACK DECIDIDA (não reabrir sem justificativa)

Decisão registrada em `ARCHITECTURE.md`. Resumo:

- **Runtime:** Cloudflare Workers (TypeScript), estendendo a infraestrutura do VixRadar.
- **Agendamento:** Cron Trigger (06:30 BRT / ajustar UTC).
- **Dados quentes/cache:** KV. **Dados estruturados (teses, trades, avaliação):** D1.
  **Relatórios/artefatos:** R2.
- **LLMs:** OpenRouter como camada principal (GPT-5.6, Gemini 3.1 Pro, Claude Opus 4.7,
  GLM-5.2, DeepSeek V4). **Kimi K2.6 via Workers AI** para tarefas agênticas baratas.
- **Quant:** TypeScript puro dentro do Worker. A matemática necessária (retornos, vol, z-score,
  drawdown, correlação, inclinação de curva, breakevens) é leve e **não** justifica um serviço
  Python/Docker separado. Só introduza Python se o `IMPLEMENTATION_PLAN.md` provar necessidade.
- **Testes:** Vitest. **Lint/format:** ESLint + Prettier. **Deploy:** Wrangler.

> Por que não Python/FastAPI/Postgres/Redis/Docker (como sugeria o plano original): duplicaria
> a infra que o VixRadar já opera, com maior custo e superfície de manutenção, sem ganho
> proporcional para uma carga que roda 1x/dia. Ver `ARCHITECTURE.md`.

---

## 3. REGRAS ABSOLUTAS

**Dados e verdade**
- Nunca invente cotações, fontes, endpoints, credenciais, consensos, fluxos, suportes,
  resistências, spreads, posições ou probabilidades.
- **Todo cálculo financeiro relevante é feito por código testado.** LLMs interpretam números,
  não os produzem.
- Todo dado carrega `source` + `timestamp` + `as_of`. Dado sem fonte vira
  `"N/D — REQUER VERIFICAÇÃO"` e é sinalizado, nunca preenchido por suposição.
- Dados de teste/mocks devem estar **explicitamente marcados como mock** e nunca substituem
  dados reais fora dos testes.

**IA e agentes**
- Cada etapa produz **saída estruturada validada** (schema em `src/schemas`). Sem JSON válido,
  a etapa falha — não improvisa.
- O sistema continua funcionando com um provedor de IA fora do ar (retry, timeout, fallback).
- Evite dependência de um único provedor. Custo por modelo é monitorado e registrado.

**Segurança e operação**
- Nunca exponha chaves. Segredos vão em `.dev.vars` (local) / secrets do Wrangler (prod),
  nunca no código nem em logs.
- Nunca faça deploy automático. Deploy é ação humana explícita.
- Nunca apague arquivos sem justificativa apresentada antes.
- Idempotência: um retry não pode duplicar teses, trades ou registros.
- Degrade com segurança: falha parcial gera relatório com seções `N/D`, não um relatório falso.

**Financeiro**
- Proibido código que execute ordem, transferência ou qualquer ação de capital.
- Cuidado com: timezone/feriados de mercado, arredondamento, unidades, %, bps, look-ahead bias,
  survivorship bias, mistura de dado observado com estimado.

---

## 4. FLUXO DE TRABALHO DO AGENTE DE CÓDIGO

1. **Diagnostique antes de codar.** Inspecione o repo, leia este arquivo, `AGENTS.md`,
   `ARCHITECTURE.md` e `MORNING_CALL_OTIMIZADO.md`. Não crie dezenas de arquivos de cara.
2. **Trabalhe uma fase por vez** (ver `IMPLEMENTATION_PLAN.md`). Antes de cada fase declare:
   objetivo, arquivos afetados, dependências, critério de conclusão, testes necessários.
3. **Teste primeiro** o comportamento de risco (quant, validação, parsing de dados).
4. Depois de cada fase: rode os testes, mostre resultados, liste arquivos alterados, explique
   decisões, registre limitações, atualize `IMPLEMENTATION_PLAN.md`.
5. Não prossiga sobre erro silenciosamente. Diante de duas arquiteturas, escolha a mais
   simples, robusta e reversível.
6. Não refatore módulos não relacionados à tarefa corrente.

---

## 5. PRINCÍPIO DE ENGENHARIA (foco no gargalo)

O gargalo deste projeto **não são os modelos — são os dados.** A maior alavancagem está em uma
camada de dados confiável e um motor quant correto. Recuse otimização prematura de orquestração,
número de agentes ou escolha de modelo enquanto a fundação de dados não estiver sólida e testada.
Ver `docs/DATA_SOURCES.md`.

---

## 6. COMANDOS (preencher conforme a Fase 1 avança)

```bash
npm install            # dependências
npm run dev            # wrangler dev (local)
npm test               # vitest
npm run lint           # eslint
npx wrangler deploy    # SOMENTE com autorização humana
```

## 7. ESTRUTURA DE DIRETÓRIOS

```
src/
  index.ts          # entry do Worker: cron + fetch
  orchestrator/     # supervisor hierárquico (fan-out/fan-in, máx. 2 rodadas)
  data/             # conectores determinísticos (BCB, B3, ANBIMA, Tesouro, FRED, CME...)
  quant/            # motor quantitativo (funções puras, 100% testadas)
  agents/           # research, macro, brasil, técnico, crédito, trade, redteam, validação, editor
  schemas/          # contratos de I/O (a fonte de verdade dos tipos)
  committee/        # scoring do comitê de investimento
  report/           # montagem do Morning Call final
prompts/            # prompts por agente (fatiados do MORNING_CALL_OTIMIZADO)
tests/              # unit + integração (com fixtures/mocks marcados)
docs/               # DATA_SOURCES.md, COST_ESTIMATE.md, etc.
```
