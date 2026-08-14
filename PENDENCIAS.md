# PENDENCIAS.md — Morning Call + Radar Quant

Primeira execução: 2026-08-14. Protocolo: skill `auditoria-pendencias`, 16 dimensões (10 base + 6 Cloudflare/LLM cascade). Método: 4 auditores paralelos por módulo (`apps/morning-call`, `apps/radar-quant`, `packages/analytics`, `briefing-interno`) + verificação de deploy via Cloudflare API + conferência dos achados de topo no código. 116 achados brutos, 80 sobreviveram à dedup e ao corte de itens cosméticos. Status: primeira execução, todos NOVO.

## Nota de atualização (14/08, noite)

Os blocos 1 e 3 foram executados na mesma sessão da auditoria. Achados RESOLVIDOS em código (o próximo `repeat-run` marca o status formal na tabela):

- `5af5ae5` fix(briefing-interno): W01, W02, W03, T01, T02, T03, T05, O02, I01. Exit codes reais para o Task Scheduler, fronteiras do OpenRouter/Resend/VixRadar com validação, GDELT com query corrigida e 429 distinto no log, URLs lidas do `.env`. 13 testes novos.
- `5fa7118` fix(radar-quant): B-004 a B-007. Null-vs-zero eliminado do gate de sinais, dado ausente nunca vota LONG, VIX ausente fecha o gate, payload do scan com guards antes do motor. 6 testes novos. Portão do monorepo verde (287 testes, typecheck e lint limpos).
- `5ba45aa` fix: bloco 2 de segurança. MC-021/022/028/029 (CORS fail-closed via `CORS_ORIGINS`, trigger com `TRIGGER_SECRET` próprio e fail-closed, secret via header, `/trigger-now` só abre fora de produção) e RQ-20/21/25/32 (auth nas rotas de generate e watchlist, timeout de 30s no Anthropic, chave do cooldown normalizada). 14 testes novos. Portão verde (301 testes, typecheck e lint limpos).

Mudança operacional a saber: o coletor de estado agora trata a resposta do VixRadar como FALHOU quando ela não traz `status` string (antes virava "Status: ?" no briefing). Se a seção VixRadar sumir do briefing de amanhã, é isso, e a correção é o Worker expor um campo `status`.

O que falta para fechar a rodada (ação humana, deploy):

1. Criar o secret `TRIGGER_SECRET` no worker morning-call (`wrangler secret put` ou dashboard). Sem ele, `/trigger` nega sempre, que é o comportamento correto, mas o endpoint fica inoperante.
2. Definir `CORS_ORIGINS` no worker morning-call (lista separada por vírgula, pergunta aberta P-02). Sem a var, nenhuma origem passa.
3. Deploy dos dois Workers: morning-call (com ENVIRONMENT=production já no wrangler.toml) e radar-quant-brasil, este último junto com o bump do hono (RQ-10, `npm audit fix` em `apps/radar-quant/worker`). Os deploys resolvem DEPLOY-01/DEPLOY-02.

## Síntese

1. Dois achados críticos no Worker morning-call, ambos violando a regra da casa de segurança: CORS `*` hardcoded (MC-021) e o trigger com fallback fail-open `|| "debug"` (MC-022). A rota `/trigger-now` sem auth nenhuma (MC-029) fecha o trio.
2. Drift de deploy nos dois Workers: `morning-call` está 1 commit atrás do repo (gate anti-eco de 06/08, +735 linhas) e `radar-quant-brasil` não recebe deploy desde 16/07, sem o fix de CORS fail-closed (`ceee10c`). O hono com 4 advisories, incluindo ReDoS no middleware cors (RQ-10), agrava.
3. A disciplina null-vs-zero do núcleo está sendo furada pelos consumidores: `signals.ts:51-54` converte score/último preço ausentes em 0, e 0 vota favorável a LONG no gate de swing (B-004 a B-007). É a reintrodução exata do bug que a disciplina existe para impedir.
4. O briefing-interno mascara falha para o Task Scheduler: `return` em escopo de script (W01/W03) faz o launcher registrar exit 0 mesmo com o portão REPROVADO, o cenário exato do briefing de hoje. E o GDELT está morto em produção por erro de sintaxe na query (O02, confirmado no log de hoje).
5. O Radar Quant tem rotas públicas sem auth que gastam dinheiro real: `POST /api/signals/generate` chama a API Anthropic com a chave do Worker (RQ-20), e a watchlist aceita escrita de qualquer um (RQ-21).
6. `agent_calls` (custo, latência, tokens por chamada LLM) existe no schema D1 e na documentação, mas nenhum código grava nela (MC-019). O teto de gasto prometido no RUNTIME_AGENTS.md não existe em runtime.
7. Nenhum fetch de dados do morning-call tem timeout (MC-017): um provider pendurado trava o Workflow inteiro do dia. Os LLMs têm timeout de 120s, os dados não.
8. `orchestrator/run.ts` é uma cópia morta da pipeline do `workflow.ts` que já driftou em modelo default e checagem de push (MC-001/MC-002). Manutenção dupla em código que não roda.
9. Fora da auditoria, nesta mesma sessão (14/08): o drift prompt x validador da REGRA 5 foi corrigido em `briefing-interno/scripts/validar_briefing.py` com teste de regressão, o briefing do dia foi reenviado ao Yan, e a decisão de cancelar o envio a clientes foi registrada no CLAUDE.md do briefing-interno.
10. O deploy dos dois apps é manual e não há CACHE_VERSION nem CI em lugar nenhum do repo: a dimensão 11 não tem como ser verificada do disco, só via dashboard.

## Modelo mental da arquitetura

Dois Workers Cloudflare implantados de forma independente (`morning-call`, `radar-quant-brasil`) construídos sobre `packages/analytics` (`@sz/analytics`), núcleo quant com disciplina estrita de null vs zero. O morning-call é orquestrado por Cloudflare Workflows: o cron 06:30 só cria a instância, e cada etapa (calendário, coleta, quant, agentes via OpenRouter/DeepSeek/Workers AI, comitê de gates booleanos, relatório) é um `step.do()`; D1 garante idempotência por pregão via `UNIQUE INDEX idx_runs_trade_date`, R2 guarda os relatórios e um push envia o macro summary para o radar-quant. O radar-quant roda um scan diário às 18h45 via Task Scheduler do Windows (TradingView controlado por CDP, powershell 5.1, scripts tsx), ingere o scan no Worker com secret + HMAC opcional, e gera sinais de swing sob demanda via Anthropic Haiku. O `briefing-interno` é um consumidor Python stdlib externo ao workspace npm: Task Scheduler 07h00, coleta notícias e estado dos três Workers, gera HTML via OpenRouter com cascade, valida num portão de 5 regras e envia por Resend só para o Yan. Nada disso tem CI, deploy é ação manual e explícita por regra da casa, e a borda Windows (Task Scheduler + powershell) concentra os defeitos de exit code e encoding que já derrubaram as três rotinas em julho e agosto.

## Tabela de achados

Legenda: Sev = Crít/Alto/Méd/Baixo. Esf = P/M/G. Cat = dimensão (1 decadência, 2 inconsistência, 3 tipo/contrato, 4 teste, 5 deps/config, 6 perf, 7 erro/obs, 8 segurança, 9 doc drift, 10 marcadores, 11 deploy drift, 12 cascade LLM, 13 KV/D1, 14 secrets, 15 rate limit, 16 auth).

### Infra e deploy (dimensão 11, verificada via Cloudflare API)

| ID | Cat | Arquivo:Linha | Sev | Esf | Status | Achado | Recomendação |
|---|---|---|---|---|---|---|---|
| DEPLOY-01 | 11 | Worker `morning-call` (último upload 06/08 16:17Z) vs repo | Alto | P | NOVO | O commit `2a03c75` (06/08 20:53Z, via merge `8abb3ae`) mudou `src/agents/calendar.ts`, `strategist.ts`, `orchestrator/run.ts`, `workflow.ts` (+735 linhas, gate anti-eco estendido) e nunca foi deployado. Produção roda sem o fix. | `npx wrangler deploy` do app morning-call na branch main atual e conferir o `modified_on` no dashboard. |
| DEPLOY-02 | 11 | Worker `radar-quant-brasil` (último upload 16/07 21:19Z) vs repo | Alto | P | NOVO | `ceee10c` (17/07) mudou `worker/src/index.ts` para CORS fail-closed, regra da casa do CLAUDE.md raiz, e não está em produção. Um mês sem o fix de segurança. | Deploy do worker radar-quant da main atual (junto com o bump do hono, RQ-10). |
| DEPLOY-03 | 11 | Conta Cloudflare, Worker `szuchmacher-briefing` (desde 06/2026) | Baixo | P | NOVO | Worker órfão sem nenhuma referência no repo (grep vazio). Ver pergunta aberta P-09. | Confirmar com o mantenedor e apagar se não tiver outro dono. |

### apps/morning-call (31 achados, 27 mantidos)

| ID | Cat | Arquivo:Linha | Sev | Esf | Status | Achado | Recomendação |
|---|---|---|---|---|---|---|---|
| MC-021 | 8 | `src/index.ts:13-17` | Crít | P | NOVO | `Access-Control-Allow-Origin: "*"` hardcoded. Viola a regra do CLAUDE.md raiz (CORS fail-closed, nunca `*`). | Adicionar `CORS_ORIGINS?: string` ao `Env`, montar o header a partir dela; se ausente/vazia, não emitir o header. |
| MC-022 | 8 | `src/index.ts:83` | Crít | P | NOVO | Fallback fail-open: `secret !== (env.RADAR_QUANT_INGEST_SECRET \|\| "debug")`. Sem secret configurado, a literal "debug" autentica o trigger em produção. | Sem secret configurado, negar sempre: `const cfg = env...; if (!cfg \|\| secret !== cfg) 401`. Combinar com MC-007. |
| MC-029 | 16 | `src/index.ts:79-86` | Alto | P | NOVO | `/trigger-now` não exige autenticação nenhuma e está no bundle de produção (o comentário diz "debug local"). | Guardar com `env.ENVIRONMENT !== "production"` ou remover da build de produção. |
| MC-028 | 15 | `src/index.ts:79-105` | Alto | P | NOVO | `/trigger` e `/trigger-now` são públicos sem rate limit, cada chamada cria Workflow com LLMs pagos; o secret do trigger trafega em query string e vai parar nos request logs da Cloudflare. | Mover o secret para header `x-trigger-secret`; preferir invocação só via cron + dashboard; documentar/implementar rate limit se mantiver. |
| MC-001 | 1 | `src/orchestrator/run.ts:57-311` | Alto | M | NOVO | `runMorningCall` duplica a pipeline inteira do `workflow.ts` e só é importado por teste. Código morto com manutenção dupla. | Remover `run.ts` + `run.test.ts`, ou reapontar os testes para o Workflow e deletar a cópia. |
| MC-002 | 1 | `src/workflow.ts:152` vs `src/orchestrator/run.ts:111` | Alto | P | NOVO | As duas pipelines já divergiram: default de modelo claude-opus-4-7 vs claude-sonnet-4, DeepSeek só no workflow, checagem de `resp.ok` no push só no run.ts. | Eliminar a cópia (MC-001); enquanto existir, extrair provider/modelo para um helper único. |
| MC-017 | 6 | `src/data/` (zero `AbortSignal` em bcb/sgs.ts, fred.ts, series.ts) | Alto | P | NOVO | Nenhum fetch de dados tem timeout; um provider pendurado trava o step inteiro do Workflow num cron diário. | `AbortSignal.timeout(15_000)` por fetch (ou signal injetado no contexto), degradando para N/D como já existe. |
| MC-019 | 7 | `migrations/0001_init.sql:118-132` + `docs/RUNTIME_AGENTS.md:198` | Alto | M | NOVO | A tabela `agent_calls` existe e o doc promete custo/tokens por agente com alerta de teto, mas nenhum código escreve nela. | Gravar `agent_calls` no `chatCompletion` (started_at, latency, tokens, status) e um check simples de teto mensal. |
| MC-005 | 1 | `src/index.ts:132-141` vs `src/report/mark.ts` | Méd | P | NOVO | O cron 18:30 é um noop logado ("falta feed de preço") enquanto `mark.ts` está escrito e testado e `trade_marks` existe na migration. O placar (Fase 7) nunca fecha. | Decidir explicitamente: implementar o feed de preço e ligar o cron, ou marcar como fase futura na ARCHITECTURE.md com data. |
| MC-007 | 2 | `src/index.ts:83` + `workflow.ts:352` | Méd | P | NOVO | `/trigger` autentica com `RADAR_QUANT_INGEST_SECRET`, secret de outra função (o header `x-ingest-secret` do push). Girar o secret do ingest quebra o trigger. | Criar `TRIGGER_SECRET` próprio via wrangler secret. |
| MC-009 | 3 | `src/schemas/agenda.ts:71-79` vs `src/data/agenda/` | Méd | M | NOVO | `RawScrapedEvent` tem schema zod mas nenhum scraper chama `.parse()`; HTML/JSON externo é castado à mão na fronteira de confiança. | `RawScrapedEvent.array().safeParse(...)` no fim de cada fetch, descartando e logando inválidos. |
| MC-012 | 4 | `src/agents/openrouter.ts:60-126` | Méd | M | NOVO | `chatCompletion`, o hot path mais caro, não tem teste unitário: timeout/abort, HTTP 4xx/5xx com corpo truncado, resposta fora do contrato, content vazio. | Testes com `fetchFn` mockado cobrindo os 4 caminhos de erro + sucesso com usage. |
| MC-013 | 4 | `tests/orchestrator/run.test.ts:2` | Méd | M | NOVO | 204 linhas de teste asseguram comportamento de `run.ts`, que não roda em produção; o Workflow real não tem teste de integração nenhum. | Portar a fixture para teste do `MorningCallWorkflow` e remover o teste do caminho morto. |
| MC-018 | 7 | `src/workflow.ts:348-355` | Méd | P | NOVO | O push do macro summary descarta a resposta: `await fetch(...)` sem capturar `resp` nem checar status. Falha do ingest é silenciosa (só loga exceção de rede). | Capturar `resp` e logar `macro_summary_push_failed` com status quando `!resp.ok`. |
| MC-023 | 9 | `prompts/strategist.md:3` vs `src/agents/strategist.ts:13` | Méd | P | NOVO | O .md declara versão `strategist@2026-07-16`; o código usa `PROMPT_VERSION = "strategist@2026-08-06-v3"` e o prompt real é construído em código. O .md é artefato morto. | Apontar o .md para o código ("prompt vive em src/agents/strategist.ts") ou deletar. |
| MC-025 | 12 | `src/agents/openrouter.ts:60-126` | Méd | M | NOVO | Sem retry com backoff no cliente; o retry existe só via reexecução do `step.do` pelo Workflows, pagando a chamada inteira de novo. | Retry 1x com backoff (~2s) só para 429/5xx/timeout, com `tentativa` gravada em `agent_calls` (MC-019). |
| MC-016 | 5 | `src/env.ts:9-18` vs `.dev.vars.example:2-4` | Baixo | P | NOVO | `DEEPSEEK_API_KEY`, `STRATEGIST_MODEL`, `RADAR_QUANT_INGEST_URL`, `RADAR_QUANT_INGEST_SECRET` referenciadas no código mas ausentes do `.dev.vars.example`. | Completar o exemplo com as 4 vars comentadas e formato esperado. |
| MC-027 | 14 | `wrangler.toml:22` | Baixo | P | NOVO | `database_id = "c9a7fda3-..."` commitado com comentário "placeholder", mas o valor tem cara de ID real de produção. | Confirmar se o ID é real; se for, substituir por placeholder óbvio e mover o real para o processo de deploy. |

### apps/radar-quant (34 achados, 26 mantidos)

| ID | Cat | Arquivo:Linha | Sev | Esf | Status | Achado | Recomendação |
|---|---|---|---|---|---|---|---|
| RQ-20 | 8 | `worker/src/routes/signals.ts:18` | Alto | M | NOVO | `POST /api/signals/generate` é público (sem auth) e chama a API Anthropic com a chave do Worker. Qualquer pessoa na internet queima quota Haiku (limitado só pelos contadores racy de RQ-29). | Exigir `x-ingest-secret` (ou token próprio) nesta rota. |
| RQ-25 | 12 | `worker/src/lib/anthropic.ts:67` | Alto | P | NOVO | `fetch` para o Anthropic sem timeout explícito: chamada pendurada segura o worker até o teto da plataforma. | `AbortSignal.timeout(30_000)`. |
| RQ-01 | 1 | `scripts/lib/signal-rules.ts:3-7` + `signal-rules.test.ts:2` | Alto | P | NOVO | Cópia morta do motor de regras do pacote, já driftou (redeclara `Regime`), referenciada só pelo próprio teste. O worker usa `@sz/analytics`. | Deletar `scripts/lib/signal-rules.ts` + teste. |
| RQ-07 | 3 | `worker/src/routes/ingest.ts:75,81-83` | Alto | M | NOVO | A fronteira de confiança (POST externo autenticado) valida só 3 campos e faz `as ScanDocument`; o `validateRadar` completo do pacote é usado apenas em teste. Payload sem `metrics` persiste no D1. | Chamar `validateRadar` na rota `/scan` antes do insert. |
| RQ-10 | 5 | `worker/package.json:26` (`hono ^4.12.25`) | Alto | P | NOVO | `npm audit` (rodou): hono ≤4.12.33 com 4 advisories, incluindo ReDoS no middleware CORS via `Access-Control-Request-Headers` e `memo()` com data disclosure. O worker usa exatamente `hono/cors`. | `npm audit fix` / bump do hono antes do próximo deploy. |
| RQ-02 | 1 | `scripts/generate-scan.ts:26-28,39` | Méd | P | NOVO | Script quebrado: lê `../scans/` (diretório inexistente, ENOENT) e `orb_vwap_optimization.json` (inexistente). Superseded por `build-scan.ts`. | Remover ou documentar como legado. |
| RQ-03 | 1 | `worker/src/db/schema.sql:1-12` | Méd | P | NOVO | Cópia redundante da migration 0001, já stale (não tem a tabela `signals` da 0002), sem referência. Segunda fonte de verdade do schema. | Deletar; a verdade está em `db/migrations/`. |
| RQ-09 | 4 | `worker/src/routes/signals.ts:18` | Méd | M | NOVO | Hot paths sem cobertura: `/api/signals/generate` (gasta quota), HMAC de ingest, `persistSignal`. Só CORS e watchlist têm teste. | Testes de comportamento para generate (fetch mockado), ingest 401/415/HMAC e persistSignal. |
| RQ-11 | 5 | `frontend/package.json:19` (`react-router-dom ^7.17.0`) | Méd | P | NOVO | Advisory high (RSC CSRF, GHSA-qwww-vcr4-c8h2). O app usa `BrowserRouter`, então o vetor não se aplica, mas o débito fica pendurado. | Bump para versão corrigida. |
| RQ-12 | 5 | `scripts/run-daily-scan.ps1:90,95,100` | Méd | P | NOVO | `npx tsx` resolve tsx via hoisting da declaração em `apps/morning-call/package.json:39`; se o Morning Call remover tsx, o scan diário quebra sem erro em dev. | Declarar tsx como dep de `scripts/` (package.json próprio) ou da raiz. |
| RQ-16 | 7 | `worker/src/` (zero `console.*`) | Méd | M | NOVO | Worker inteiro sem log estruturado; falhas de ingest, geração LLM e persistência não deixam rastro no Workers Observability. | Log mínimo em ingest e generate (status, símbolo, latência). |
| RQ-17 | 7 | `worker/src/routes/signals.ts:75` | Méd | P | NOVO | 502 expõe `detail` do erro do Anthropic ao cliente, violando o CLAUDE.md do app ("nunca expor detalhes internos"). | Logar o detail e responder genérico. |
| RQ-21 | 8 | `worker/src/routes/watchlist.ts:34,61` | Méd | M | NOVO | POST `/` e `/remove` da watchlist públicos sem auth: qualquer um altera o universo que o scan diário coleta. | Exigir o mesmo secret dos routes de ingest. |
| RQ-26 | 12 | `worker/src/lib/anthropic.ts:67-78` | Méd | P | NOVO | Sem retry com backoff: 429/5xx transitórios viram 502 direto para o cliente. | 1-2 retries com backoff exponencial e jitter só em 429/5xx. |
| RQ-28 | 13 | `worker/src/lib/persist-signal.ts:8-10` | Méd | P | NOVO | `signals:latest` com read-modify-write cego (get → concat → put): duas gerações concorrentes perdem entradas silenciosamente. | Tratar D1 como fonte (query por market_date) e KV como cache com TTL. |
| RQ-29 | 13 | `worker/src/routes/signals.ts:31-35,95-96` | Méd | P | NOVO | Contador diário e cooldown também são RMW cego no KV: corrida permite estourar o cap de 200. | KV com metadata/incremento ou contador em D1. |
| RQ-32 | 15 | `worker/src/routes/signals.ts:31` | Méd | P | NOVO | Cooldown usa o símbolo raw do body como chave: `petr4` e `PETR4` são chaves diferentes, bypass trivial dos 60s. | Normalizar (upper, prefixo) antes de montar a chave. |
| RQ-14 | 6 | `scripts/fetch-news.ts:49-51` | Baixo | P | NOVO | `apiFetch` do Finnhub sem timeout/AbortSignal; só morre pelo limite de 15 min da task. O RSS tem timeout de 15s, padrão não uniforme. | Mesmo `AbortSignal.timeout(15_000)` no Finnhub. |
| RQ-19 | 7 | `scripts/logs/scan-2026-08-13_184500.log:1-2` | Baixo | P | NOVO | Logs do scan com acentos corrompidos (mojibake): pipe do tsx UTF-8 para `Add-Content` sob powershell 5.1 grava em encoding errado. | `[Console]::OutputEncoding` e `-Encoding UTF8` no Add-Content. |
| RQ-22 | 9 | `docs/TRADINGVIEW-TOOLING.md:6` | Baixo | P | NOVO | Doc diz que a task usa "pwsh via WindowsApps path", mas o canônico atual é `powershell.exe` 5.1 puro. O doc descreve exatamente a configuração que causou os incidentes de 07/21-07/24. | Atualizar a linha para powershell.exe 5.1. |
| RQ-31 | 14 | `scripts/push-signal.ts:2`, `push-operator-snapshot.ts:2`, `generate-scan.ts:3` | Baixo | P | NOVO | `INGEST_SECRET ?? 'dev-secret'` hardcoded em 3 scripts versionados. Não funciona contra prod (fail-closed), mas é fallback de segredo em código. | Remover o fallback e exigir a var. |
| RQ-34 | 2 | `scripts/register-scan-diario-task.ps1:22` | Baixo | P | NOVO | `$ProjectRoot` hardcoded absoluto com espaço, enquanto o commit `84ab988` padronizou `$PSScriptRoot` nos demais PS1. Quebra se o diretório mover. | Derivar de `$PSScriptRoot`. |

### packages/analytics (26 achados, 16 mantidos)

| ID | Cat | Arquivo:Linha | Sev | Esf | Status | Achado | Recomendação |
|---|---|---|---|---|---|---|---|
| A-002 | 3 | `src/types.ts:21` vs `src/analytics.ts:52-69` | Alto | M | NOVO | Dois contratos paralelos para o mesmo item: `RadarItem` (tudo não-nulo) e `AnalyticsItem` (nulável). O produtor gera a forma nulável; consumidores tipam a não-nula. | Unificar no contrato nulável (o wire format real) e tipar consumidores com guards. |
| A-005 | 3 | `src/convergence.ts:124` | Alto | M | NOVO | `if (item.regime === "SEM_DADO" as never)`: `Regime` não inclui `SEM_DADO/RISCO/ATENCAO`, mas `classifyRegime` os retorna. O cast silencia o compilador sobre um contrato real; testes perpetuam o cast. | Estender a união `Regime` com os 3 estados e remover os casts. |
| B-004 | 3 | `apps/radar-quant/worker/src/routes/signals.ts:51` | Alto | P | NOVO | `ibov?.score ?? 0`: score ausente vira 0, e 0 satisfaz `ibovScore >= 0` no gate de swing. Dado ausente vota favorável a LONG. Reintrodução exata do bug que a disciplina null existe para impedir. | Propagar null (`ibovScore: number \| null`) e tratar no gate. |
| B-005 | 3 | `apps/radar-quant/worker/src/routes/signals.ts:52` | Méd | P | NOVO | `vix?.last ?? 0`: VIX ausente vira 0, e `0 >= 25 = false` faz o gate de risco abrir (fail-open) sem dado de VIX. | Null explícito e gate fechado na ausência. |
| B-006 | 3 | `apps/radar-quant/worker/src/routes/signals.ts:54` | Méd | P | NOVO | `usdbrl?.last ?? 0`: mesmo padrão; 0 entra no prompt macro como preço real. | Null e tratamento no prompt. |
| B-007 | 3 | `apps/radar-quant/worker/src/routes/signals.ts:56-61` | Méd | P | NOVO | `item.score`/`metrics.ret_20d` tipados number via `RadarItem`, mas o payload real é nulável; `null > -15 && null < 15` coage a true ("banda lateral"). | Tipar o scan parseado com o contrato nulável e guards antes do motor. |
| A-003 | 3 | `src/validate.ts:74` | Méd | P | NOVO | `validateRadar` aceita `item.type` só como `"macro" \| "acao"`, mas o tipo real inclui `vix`, `indice`, `cripto` etc. Um scan com item vix seria rejeitado; invisível porque as fixtures só têm macro/acao. | Aceitar a união completa e cobrir com fixture de item vix (A-013). |
| A-009 | 3 | `tsconfig.json:10-16` + `ARCHITECTURE.md:44-47` | Méd | M | NOVO | Dívida registrada `noUncheckedIndexedAccess: false`. Contagem real hoje: 7 acessos em src (linhas 98, 99, 151, 175, 176, 207, 369), não os "8" do comentário; testes também acusariam ao ligar. | Corrigir o número no comentário/AD e executar a flag + guardas como tarefa própria com testes. |
| A-010 | 4 | `src/analytics.ts:397-405` | Méd | P | NOVO | `assignCrossRanks`, hot path do ranking cross-sectional, sem teste nenhum no repo. | 3 testes: empate de score, n<2, distribuição -100..100. |
| A-011 | 4 | `src/signal-rules.ts:34` | Méd | P | NOVO | `evaluateSwingSetup` do pacote sem teste no pacote; os únicos testes cobrem a cópia morta do script (RQ-01). | Portar os testes para `packages/analytics/tests/` e apagar o par do script. |
| A-016 | 7 | `src/convergence.ts:113` + `worker/src/routes/convergence.ts:73` | Méd | P | NOVO | `evaluateConvergence` acessa `item.quality.symbolError` sem proteção; item legado sem `quality` lança TypeError → 500. O gate irmão `isRankable` foi blindado, este não. | Mesma defesa defensiva do `isRankable` e/ou try/catch na rota. |
| B-001 | 3 | `src/analytics.ts:318-319` | Méd | P | NOVO | `(ret_5d ?? 0) > 0` em `classifyRegime`: null coage a voto neutro. Hoje inofensivo por invariante, mas o parâmetro é `Partial<ComputedMetrics>`. | `typeof ret_5d === "number" && ret_5d > 0` (e simétrico). |
| A-006 | 1 | `src/analytics.ts:71-79` | Baixo | P | NOVO | `NullMetrics` exportado e nunca referenciado; o comentário explica que saiu do tipo e sobrou o cadáver. | Deletar o tipo. |
| A-012 | 4 | `src/analytics.ts:96-102,114-124` | Baixo | P | NOVO | Sem testes para `close: NaN`, close ausente, e o caminho `ret_5d ?? 0` (B-001). | Teste parametrizado de métricas com entradas sujas. |
| A-014 | 5 | `apps/morning-call/package.json:18` | Baixo | P | NOVO | `@sz/analytics: "*"` declarado no morning-call sem nenhum import no app. | Remover a dependência ou efetivar o uso. |

### briefing-interno (25 achados, 22 mantidos)

| ID | Cat | Arquivo:Linha | Sev | Esf | Status | Achado | Recomendação |
|---|---|---|---|---|---|---|---|
| W01 | 2 | `scripts/run_briefing.ps1:69,82,89,122,132,138,153` | Alto | P | NOVO | Sete `return` em escopo de script: não definem exit code do processo pwsh. O launcher lê `$proc.ExitCode` e registra exit 0 mesmo com portão REPROVADO (linha 138) ou ERRO FATAL (122). O Task Scheduler vê sucesso. Cenário exato do briefing de hoje. | Trocar os 7 `return` por `exit` com código (ex.: `exit 5`, `exit $exitCode`). |
| W02 | 2 | `scripts/run_envio_clientes.ps1:32` | Alto | P | NOVO | `python "$ProjectRoot\scripts\enviar_briefing.py" $HtmlDoDia --clientes`: `$HtmlDoDia` contém "Morning Call" (espaço) sem aspas. Powershell 5.1 não auto-quota variável, o path vira dois argumentos. Só não mordeu hoje porque o envio parou antes no "SEM APROVACAO". | Aspas duplas: `"$HtmlDoDia"`. |
| W03 | 2 | `scripts/run_envio_clientes.ps1:22,29,38` + linha 9 | Alto | P | NOVO | Mesmo defeito do W01 num script que roda direto no powershell 5.1 (exit code sempre 0 para o Task Scheduler). Além disso `$ProjectRoot` hardcoded na linha 9. | Trocar por `exit` e derivar `$ProjectRoot` de `$PSScriptRoot`. |
| T01 | 3 | `scripts/gerar_briefing.py:271` | Alto | P | NOVO | `json.loads(resp.read())` pode lançar `JSONDecodeError` (200 com corpo não-JSON: página de erro de proxy, corpo vazio), não capturado pelos `except` nem pelo main. Resposta malformada derruba o pipeline em vez de cair no fallback. | Incluir `json.JSONDecodeError` no try convertendo para `RuntimeError`; teste com corpo não-JSON. |
| T02 | 3 | `scripts/enviar_briefing.py:491-492,505` | Méd | P | NOVO | Mesmo padrão do T01 na fronteira Resend, e `result.get("id")` assume dict: resposta 200 com shape diferente retorna True sem envio real. | Capturar JSONDecodeError e exigir `result.get("id")` para declarar sucesso. |
| T03 | 3 | `scripts/coletar_estado.py:232` | Méd | P | NOVO | `staleness.get("dias_atraso", 0) >= 2`: quando `marketDate` é inválido, `_calc_staleness` devolve `None` e `None >= 2` levanta TypeError não capturado, crashando o coletor. | `(staleness.get("dias_atraso") or 0) >= 2`. |
| T04 | 3 | `scripts/validar_briefing.py:27-28,192` | Méd | M | NOVO | O comentário afirma "carregamos do JSON, mas temos fallback hardcoded", mas a REGRA 3 usa só as listas hardcoded e o JSON carregado nunca é usado. Contradiz o CLAUDE.md: um projeto adicionado ao JSON sem tocar nas listas passa invisível. | Derivar os conjuntos de `projetos-exposicao.json` na main, listas só como fallback; ou corrigir comentário e CLAUDE.md. |
| T05 | 3 | `scripts/coletar_estado.py:255-265` | Méd | P | NOVO | `if vx:` aceita qualquer JSON como OK (evidência de hoje: `OK: status=?`). Se a resposta for array, `vx.get` dá AttributeError. | Exigir `isinstance(vx, dict)` e `vx.get("status")` string, senão `ok: False`. |
| A01 | 1 | `_load_env` em 4 scripts, `_load_json` em 3, `ROOT/LOG_DIR/BRT/UA` em 5 | Méd | M | NOVO | Duplicação de helpers em todos os scripts do pipeline. | Módulo `scripts/_comum.py` com `load_env`, `load_json`, `UA`, `BRT`, `RESEND_API`. |
| A02 | 1 | `rodar_tudo.bat:2` | Méd | P | NOVO | `cd /d "E:\Diretorio\Claude\Briefing Matinal"`: caminho inexistente desde a unificação de 09/08. Runner manual quebrado e duplicado do `pipeline_completo.ps1`. | Corrigir o caminho ou deletar o .bat. |
| I01 | 2 | `scripts/coletar_estado.py:187-189,210-212,251-253` | Méd | P | NOVO | As 3 URLs dos workers são lidas só de `os.environ`, mas o `.env.example` as documenta como chaves de `.env` e o coletor nunca chama `_load_env`. Quem configura no .env acha que está configurando. | Chamar `_load_env()` primeiro, com `os.environ` como fallback. |
| Q01 | 4 | `tests/test_validar_briefing.py` (único teste do pipeline) | Méd | M | NOVO | Só o validador tem teste, e só dos padrões direcionais. Sem teste: `_normalize_url` (REGRA 1, já mordeu em 13/08), `_strip_fonte_e_confianca`, `build_styled_email`, `_load_env`, `_calc_staleness` (com o bug T03). | Começar pelos puros via unittest; mocks de urllib para os demais. |
| C01 | 5 | `.gitignore` raiz:76 + `briefing-interno/.env.example` | Méd | P | NOVO | O `.env.example` (única documentação das env vars) é negado pela regra `.env.*` do .gitignore raiz e não está versionado. | Adicionar exceção `!briefing-interno/.env.example` no .gitignore raiz. |
| O01 | 7 | `scripts/coletar_noticias.py:61-62`; `coletar_estado.py:61-62` | Méd | P | NOVO | `except Exception: return None` descarta a causa (timeout vs DNS vs 403); o log só diz "FALHOU (sem resposta)". | Registrar `exc.__class__.__name__` e mensagem no stderr, mantendo o return None. |
| O02 | 7 | `scripts/coletar_noticias.py:153-156,172-178` | Méd | P | NOVO | GDELT morto em produção: as queries usam OR sem parênteses e a API responde "Queries containing OR'd terms must be surrounded by ()." (evidência no log de hoje). O código classifica como "provavel rate-limit" e a fonte contribui zero notícias. | Parênteses na query `(ibovespa OR bovespa OR ...)` e distinguir erro de sintaxe de rate-limit na mensagem. |
| A03 | 1 | `scripts/gerar_briefing.py:299-300,380-383` | Baixo | P | NOVO | Flags `--send` e `--dry-run` são no-ops (só print); `pipeline_completo.ps1:24` e `rodar_tudo.bat:17` chamam com `--dry-run` achando que muda algo. | Remover as flags ou dar semântica real ao `--dry-run`. |
| I02 | 2 | `scripts/run_briefing.ps1:74` | Baixo | P | NOVO | `$coberturaAte -lt $DateTag` compara "2027-12-31" com "20260814" por string. Funciona por acaso hoje; no mesmo ano, alerta falso de cobertura expirada. | `[datetime]` dos dois lados. |
| Q02 | 4 | `tests/test_validar_briefing.py:58-66` | Baixo | P | NOVO | `test_briefing_20260814_real` acopla a suíte ao artefato vivo `outputs/briefing_20260814.html`: se sumir vira skip (verde falso), se regenerar com 3 direcionais quebra. | Fixar HTML de teste em `tests/fixtures/`. |
| C02 | 9 | `scripts/__pycache__/*.cpython-314.pyc` vs `CLAUDE.md:15` | Baixo | P | NOVO | CLAUDE.md declara "Python 3.11"; a máquina roda 3.14. Funciona (stdlib), mas a doc defasou e o `python` da task pode resolver outro interpretador no futuro. | Atualizar o CLAUDE.md ou fixar a versão no PATH da task. |
| P01 | 6 | `scripts/coletar_estado.py:87-119`; `coletar_noticias.py:97-109,148-190` | Baixo | M | NOVO | Coletas de rede sequenciais: 14 símbolos Yahoo com timeout 15s (pior caso ~3,5 min) + 4 RSS + sleeps do GDELT. Em dia ruim, o job das 07h estoura a janela antes do watchdog das 07h20. | `ThreadPoolExecutor` (stdlib) com 4-6 workers nas coletas de rede. |
| S01 | 8 | `scripts/gerar_briefing.py:352` | Baixo | P | NOVO | Imprime `_openrouter_url(env)` no log; se alguém configurar proxy com `?key=` na URL, a chave vai ao log. | Imprimir só o host ou a URL sem query. |
| O03 | 7 | `scripts/run_briefing.ps1:51-58` | Baixo | P | NOVO | Linhas do Python no `_py.log` sem timestamp e os tmp `stdout_*.tmp`/`stderr_*.tmp` nunca são apagados. | Prefixar timestamp por linha no merge e remover os tmp. |

## Top 5 prioridades absolutas

1. **Fechar a segurança do Worker morning-call (MC-021, MC-022, MC-029).**
   Sketch: em `env.ts`, `CORS_ORIGINS?: string`. Em `index.ts`, substituir o objeto fixo por função `corsHeaders(env)` que só emite o header se `env.CORS_ORIGINS` tiver valor (split por vírgula, match exato da Origin). No trigger: `const cfg = env.TRIGGER_SECRET; if (!cfg || secret !== cfg) return 401;` (sem literal "debug", secret próprio criado via wrangler, MC-007). Guardar `/trigger-now` com `env.ENVIRONMENT !== "production"`. Esforço total: P. Risco: baixo, é devolver o comportamento que o CLAUDE.md raiz já manda.

2. **Deploy dos dois Workers no código atual + bump do hono (DEPLOY-01, DEPLOY-02, RQ-10).**
   Sketch: `npm audit fix` em `apps/radar-quant/worker` (bump hono para >4.12.33); rodar o portão do repo (`npm test && npm run typecheck`); `npx wrangler deploy` em `apps/morning-call` e em `apps/radar-quant/worker` (`--config ./wrangler.toml` obrigatório no Windows). Conferir `modified_on` dos dois Workers no dashboard após o deploy. Isso coloca em produção o gate anti-eco e o CORS fail-closed, dois fixes que já estão no main há dias.

3. **Exit codes do briefing-interno (W01, W02, W03).**
   Sketch: em `run_briefing.ps1`, trocar os 7 `return` de escopo de script por `exit` com o mesmo valor já usado; em `run_envio_clientes.ps1`, idem nas linhas 22/29/38, `$HtmlDoDia` entre aspas na linha 32 e `$ProjectRoot = Split-Path -Parent $PSScriptRoot` na linha 9. É a regra de casa do CLAUDE.md global (precedente do bug do Task Scheduler corrigido em 06/08 no `run-daily-scan.ps1`).

4. **Null-vs-zero no consumer de sinais (B-004, B-005, B-006, B-007).**
   Sketch: em `signals.ts:50-54`, `const ibovScore: number | null = ibov?.score ?? null` (idem `vixLast`, `usdbrlLast`); passar null ao `evaluateSwingSetup` com o gate tratando ausência como sem-dado (não vota LONG, não abre risco). Ajustar `MacroCtx` para aceitar null e o prompt macro para dizer "sem dado" em vez de 0. Acompanhar de teste: dado ausente não pode produzir sinal LONG.

5. **Fechar as rotas públicas que gastam dinheiro (RQ-20, RQ-21).**
   Sketch: middleware em `signalRoutes` e `watchlistRoutes` exigindo header `x-ingest-secret` igual ao do ingest (reusar a verificação de `ingest.ts`, extrair para `lib/auth.ts`). Combinar com RQ-32 (normalizar símbolo na chave do cooldown) e RQ-29 (contador em D1). Depois disso, a superfície pública do Worker fica só leitura.

## Ganhos rápidos (esforço P, severidade Média ou maior)

- [ ] MC-021: CORS a partir de `CORS_ORIGINS`, fail-closed.
- [ ] MC-022: remover fallback `|| "debug"`, negar sem secret.
- [ ] MC-029: `/trigger-now` só fora de produção.
- [ ] MC-028: secret do trigger em header, não query string.
- [ ] MC-007: `TRIGGER_SECRET` próprio.
- [ ] MC-017: `AbortSignal.timeout(15_000)` nos fetches de dados.
- [ ] MC-018: capturar `resp` no push do macro summary.
- [ ] MC-002: extrair seleção provider/modelo para helper único (até a cópia morrer).
- [ ] MC-005: decidir o cron 18:30 noop (ligar ou marcar fase futura).
- [ ] RQ-20/RQ-21: auth nas rotas de generate e watchlist.
- [ ] RQ-25: timeout de 30s no fetch do Anthropic.
- [ ] RQ-26: retry 1-2x com backoff em 429/5xx.
- [ ] RQ-28/RQ-29: contadores e signals:latest saindo do RMW cego.
- [ ] RQ-32: normalizar símbolo na chave do cooldown.
- [ ] RQ-10: bump do hono (audit fix).
- [ ] B-004 a B-006: `?? null` em vez de `?? 0` no signals.ts.
- [ ] A-003: validar a união completa de `item.type`.
- [ ] A-016: blindar `item.quality` no evaluateConvergence.
- [ ] B-001: `typeof` no lugar do coalesce em classifyRegime.
- [ ] W01/W02/W03: exit em vez de return nos dois orquestradores.
- [ ] T01: capturar JSONDecodeError no cascade do OpenRouter.
- [ ] T03: `(dias_atraso or 0)` no coletor de estado.
- [ ] T05: exigir dict + status string na fronteira do VixRadar.
- [ ] O02: corrigir a query do GDELT com parênteses.
- [ ] I01: coletar_estado lendo `.env` de verdade.

## Parece ruim mas está OK

1. **`ensureRun` SELECT-then-INSERT** (`apps/morning-call/src/db/runs.ts:33-58`). Parece read-modify-write cego com corrida, mas o catch re-lê e reusa o `run_id` do vencedor e o `UNIQUE INDEX idx_runs_trade_date` torna o invariante do banco, não do código. Correta.
2. **Eco de prompt checado fora do `step.do`** (`src/workflow.ts:172-175`). Parece inconsistência de fluxo, mas dentro do step o throw dispararia retry do Workflow e o modelo ecoaria de novo, pagando a chamada várias vezes. Decisão deliberada e correta.
3. **`except Exception: return None` nos coletores do briefing** (`coletar_*.py`). Parece erro engolido, mas é a política de robustez correta (coletor nunca derruba o pipeline). O achado O01 pede só o registro da causa, não mudar o comportamento.
4. **Timeout OpenRouter de 180s no briefing.** Parece excessivo, mas é por tentativa e por provedor no cascade (primário e fallback têm urlopen próprios) e estouro vira RuntimeError → fallback. O requisito "timeout por provedor" está atendido.
5. **REGRA 4 do validador neutralizada com código antigo em comentário** (`validar_briefing.py:147-170`) e `_radar_row` morto no enviador. Código morto deliberado e auto-documentado, com instrução de reativação no CLAUDE.md. Recuperável do git; manter é decisão de produto.
6. **`wakeup-briefing-ADMIN.ps1` com `$ErrorActionPreference = 'Stop'`.** A regra da casa manda 'Continue' para scripts do Task Scheduler; este é script manual, elevado, de execução única, onde 'Stop' é fail-fast intencional.
7. **`vixRisco(input)` de uma linha no pacote.** Parece indireção morta, mas isola a semântica ("risco via VIX") para quando o cálculo mudar.
8. **`responseFormatJsonSchema` gigante duplicando o zod** (`strategist.ts:173-316`). Parece duplicação de contrato, mas é requisito do Structured Output da Anthropic; a validação fina fica com o zod.
9. **`HTTP-Referer: "https://vixradar.com"` no cliente OpenRouter** (`openrouter.ts:92`). Referer de outro produto, mas é só identificação cosmética para o ranking do OpenRouter; o `X-Title` já identifica "morning-call".
10. **`run-daily-scan.ps1` mata o TradingView com `Stop-Process -Force`.** Parece destrutivo, mas é o contrato necessário para CDP limpo no scheduler, loga a ação, e a alternativa quebraria o scan diário.
11. **Fetches sequenciais do FRED (7x) e SGS (5x) e os 14 símbolos do Yahoo no briefing.** N+1 em sentido estrito, mas a carga é 1x/dia num cron; paralelizar sem cuidado no briefing é o P01, de risco operacional baixo, não urgente.
12. **`schemaVersion` muda por presença de `news.json`** (`build-scan.ts:133`). Parece versionamento instável, mas é semver válido refletindo payload opcional de notícias.

## Perguntas abertas para o mantenedor

1. **P-01:** o Worker órfão `szuchmacher-briefing` na conta Cloudflare (sem referências no repo desde 06/2026) tem outro dono ou pode ser apagado?
2. **P-02:** quais origens devem constar em `CORS_ORIGINS` para o worker morning-call? (Precisa da resposta para fechar o MC-021 sem regressão de acesso.)
3. **P-03:** o `database_id` commitado no `wrangler.toml` do morning-call é o ID real de produção ou placeholder? (MC-027.)
4. **P-04:** com o envio a clientes cancelado (decisão de hoje), o `run_envio_clientes.ps1` e o modo `--clientes` do `enviar_briefing.py` devem ser removidos ou ficam como código morto documentado?
5. **P-05:** o cron 18:30 de marcação a mercado (MC-005) vai ser implementado agora (feed de preço por `unidade`) ou é fase futura? Sem isso o placar da Fase 7 nunca fecha.
6. **P-06:** a REGRA 3 do validador deve derivar os projetos do `projetos-exposicao.json` (T04) ou as listas hardcoded são deliberadas por segurança?
7. **P-07:** os thresholds de coverage no `vitest.config.ts` (MC-015) devem passar a ser exigidos no portão (`npm test` com `--coverage`) ou removidos?
8. **P-08:** o GDELT (O02) merece correção da query ou deve sair do pool? Ele contribui zero notícias desde que quebrou.
9. **P-09:** onde o frontend do radar-quant é deployado (Pages? Worker `radar-dashboard` de 06/2026?)? O auditor não conseguiu fechar a dimensão 11 do frontend sem essa informação.

## Nota de repetição

Próximo `repeat-run`: reler este arquivo, marcar `RESOLVIDO` o que sumir do código, `ATUALIZADO` o que mudar de forma, `ABERTO` o que seguir igual, e adicionar achados novos como `NOVO`. Os achados de topo desta rodada (MC-021/022, DEPLOY-01/02, W01, B-004) são os primeiros candidatos a mudar de status.
