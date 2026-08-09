# Plano de Execução — Instrumento do Portão 1 (ramo (a), no Worker)

> Escrito **depois** que P1 travou. Decisões: **P1 = (a) máquina de calls**; **runtime = Worker
> Cloudflare desde já** (resolve PC-2 por física: quant é TypeScript, `quant.py` vira golden test);
> **P3 = todas as classes** (juros BR, câmbio, crédito/debêntures, macro+geopolítica, cripto/metais,
> renda variável). Ver `PLANO_ESTRATEGICO.md`.
>
> **Escopo deste plano.** Só o **instrumento de medida do Portão 1**: o mínimo que permite rodar o
> modelo único closed-book todo dia, gravar as calls, marcá-las a mercado e comparar com os
> baselines. **Não** é o produto de 19 seções — isso é Portão 3, e só se o Portão 1 passar.
>
> **Teste sempre forward.** O placar do Portão 1 se acumula daqui para frente (paper-trade), nunca
> em histórico dentro da janela de treino do modelo (look-ahead de cutoff contamina).
>
> **Verificação em PowerShell** (Windows). Uma tarefa por vez; não avança sobre teste vermelho.

## Kill pré-registrado (P2) — **TRAVADO: N = 100 trades** (16/07/2026)

- **Smoke test (~20-30 pregões):** se o modelo único estiver obviamente perdendo para buy-and-hold
  **e** para o null, mata cedo. Barato, binário. No código: `DEFAULT_SMOKE_N = 25`.
- **Prova de borda — N = 100 trades marcados.** Decisão do operador em 16/07, fechando o "ajustar
  N" que este documento carregava. Enquanto era "N ≫ 30", o kill não tinha número, e kill sem
  número não é pré-registrado: é intenção que se ajusta depois de ver o resultado.
  - **Por que 100:** ordem de grandeza acima do smoke, e o mínimo defensável em prática de quant
    para ter alguma leitura de hit rate e Sharpe antes de escalar capital real.
  - **O que 100 não é:** o N que MinTRL / Deflated Sharpe exigiriam para significância formal
    corrigida por multiple-testing — esse depende do Sharpe observado e do número de ideias
    testadas, e para Sharpe baixo passa de mil observações. 100 é o limiar operacional para
    **parar de ser fumaça** e permitir decisão sob incerteza, dita em voz alta (§6 do estratégico).
  - **Contado em trades, não pregões:** dia sem trade não testa a tese. O placar já separa
    `n_days` de `n_trades`.
- **"Bater" (também travado):** superar buy-and-hold **e** o null na média diária **e** ter
  `model_sharpe > bh_sharpe`. Ganhar na média com o triplo da vol é alavancagem, não borda.

**Enforcement, não documentação:** `PROVA_N_TRADES = 100` em `src/report/scoreboard.ts`, e o
placar expõe `promocao_autorizada`, que só é `true` com `leitura: "sinal_candidato"` **e**
`n_trades >= 100`. Antes, `sinal_candidato` era alcançável no smoke test (25 pregões) e lia-se
como aprovação — o kill tinha número para começar e nenhum para terminar. Enquanto
`promocao_autorizada` for `false`, o Portão 3 (multi-agente) não está autorizado e capital real
não escala.

---

## Tarefas

### T1 — Motor quant em TypeScript (core puro) + golden tests · fecha PC-2

- **Objetivo:** funções puras (retorno, log-retorno, vol realizada, drawdown, momentum, z-score,
  correlação, inclinação/curvatura de curva, breakeven, risco-retorno) em TS, idênticas ao
  `skill/morning-call/scripts/quant.py`.
- **Arquivos:** `src/quant/core.ts`, `tests/quant/core.test.ts`.
- **Dependência:** nenhuma (puro, sem rede, sem LLM).
- **Verificação:** `npm test` verde; golden tests reproduzem os valores do `quant.py`.
- **Conclusão:** `src/quant` deixa de estar vazio; `quant.py` passa a ser referência, não runtime.

### T2 — Métricas por ativo respeitando Venue/as_of · fecha PC-1

- **Objetivo:** construir `AssetMetrics`/`WindowReturn` a partir de séries datadas, preenchendo
  `janela_as_of` e `observacoes`. Um retorno 1D que cruze praças (US ontem × BR hoje) sem marcar
  as pontas deve **falhar em teste**.
- **Arquivos:** `src/quant/metrics.ts`, `tests/quant/metrics.test.ts`.
- **Dependência:** T1.
- **Verificação:** teste que injeta série cruzando `Venue` e espera erro/flag.
- **Conclusão:** PC-1 fechada em código, não em prosa.

### T3 — Camada de dados pública → snapshot em D1

- **Objetivo:** conectores para BCB (SGS/PTAX/Focus), FRED, US Treasury (públicos, verificados em
  `docs/DATA_SOURCES.md`), produzindo `DataPoint[]` com `source`+`as_of`+`venue`; faltante vira
  `status:"ND"`. Grava `MarketSnapshot` em D1 **antes** de qualquer LLM.
- **Arquivos:** `src/data/*.ts`, `src/data/snapshot.ts`, `tests/data/*.test.ts`.
- **Dependência:** T2.
- **Verificação:** `wrangler dev` + rota de teste que busca ao vivo e valida contra `MarketSnapshot`;
  teste de parsing com fixtures marcadas como mock.
- **Conclusão:** snapshot real datado persistido; N/D nunca vira 0.

### T4 — Modelo único closed-book + cross-check no pipeline

- **Objetivo:** cliente OpenRouter (1 modelo forte) recebendo **só o snapshot**; structured output
  produz `QuantClaim[]` + `TradeCardDraft[]`. Roda o cross-check (`src/committee/crossCheck.ts`) e
  o parse dos schemas; afirmação com número órfão ou divergente é rejeitada em código.
- **Arquivos:** `src/agents/strategist.ts`, `src/agents/openrouter.ts`, `prompts/strategist.md`.
- **Dependência:** T3.
- **Verificação:** teste com snapshot fixo + resposta mock: número inventado é barrado; `Provenance`
  gravada.
- **Conclusão:** nenhum número publicado sem origem no snapshot.

### T5 — Persistir calls (publicadas e rejeitadas) + baselines

- **Objetivo:** gravar `trades` (com `publicado`/`motivo_rejeicao`) e registrar os baselines do dia:
  buy-and-hold do ativo, null (não operar), consenso (Focus). São o denominador do placar.
- **Arquivos:** `src/report/persist.ts`, `src/quant/baselines.ts`, testes.
- **Dependência:** T4.
- **Verificação:** teste de idempotência (retry reusa `run_id`, não duplica).
- **Conclusão:** toda call e todo baseline do dia no D1.

### T6 — Cron de marcação 18:30 → trade_marks (MAE/MFE)

- **Objetivo:** segundo cron marca a mercado as calls abertas, preenche `trade_marks`
  (pnl/MAE/MFE/status). Sem isto o ciclo nunca fecha e o placar não existe.
- **Arquivos:** `src/report/mark.ts`, `tests/report/mark.test.ts`.
- **Dependência:** T5.
- **Verificação:** teste com preços simulados cobrindo alvo_1/alvo_2/invalidado/expirado.
- **Conclusão:** placar diário acumulando forward.

### T7 — Relatório mínimo em R2

- **Objetivo:** montar o `MorningCall` mínimo (abertura, trades, ranking, rastreabilidade §18),
  validar (`ValidationReport`), gravar em R2 e o ponteiro em `reports`.
- **Arquivos:** `src/report/build.ts`, `src/committee/validate.ts`, testes.
- **Dependência:** T4.
- **Verificação:** relatório com trade sem invalidação/fonte é reprovado; probabilidades somam 100%.
- **Conclusão:** entregável diário auditável.

### T8 — Painel de placar (modelo × baselines) + leitura de significância

- **Objetivo:** consolidar, ao longo do tempo, modelo único vs buy-and-hold vs null vs consenso,
  com **contagem de observações** e a leitura honesta (MinTRL): abaixo de N, é fumaça.
- **Arquivos:** `src/report/scoreboard.ts` (ou artifact/dashboard no VixRadar), testes.
- **Dependência:** T6.
- **Verificação:** com dados sintéticos, o painel classifica corretamente "fumaça" vs "sinal".
- **Conclusão:** o Portão 1 tem número, não reticências. **Checkpoint de kill aqui.**

---

## Estado

- [x] T1 quant core + golden tests
- [x] T2 metrics Venue / janela_as_of (PC-1)
- [x] T3 data pública + snapshot (BCB SGS/Focus, FRED, UST) — live depende de rede/keys
- [x] T4 strategist closed-book + crossCheck + gates (mock offline)
- [x] T5 persist helpers D1 (trades pub/rej) + baselines extract
- [x] T6 mark MAE/MFE (puro, testado)
- [x] T7 report mínimo + ValidationReport
- [x] T8 scoreboard + leitura fumaça/sinal

Ver também `PLANO_DEFINITIVO.md`. Cross-check: `src/committee/crossCheck.ts` + `QuantClaim`.

**Ainda operacional (não código puro):** bindings D1/R2 reais, FRED/OpenRouter secrets, cron mark com preço live, Workflows CF wrapper, paper-trade forward acumulando N.
