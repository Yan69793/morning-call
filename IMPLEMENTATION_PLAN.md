# IMPLEMENTATION_PLAN.md — Plano de Implementação

Uma fase por vez. Antes de cada fase: objetivo, arquivos afetados, dependências, critério de
conclusão, testes. Depois: rodar testes, listar mudanças, registrar limitações, atualizar este
arquivo. **Escopo do v1 = MVP enxuto sobre fundação de dados+quant testada.**

Legenda: `[ ]` pendente · `[~]` em andamento · `[x]` concluído

---

## Fase 0 — Fundação do repositório
- [x] Estrutura de diretórios
- [x] CLAUDE.md, AGENTS.md, ARCHITECTURE.md, MORNING_CALL_OTIMIZADO.md
- [ ] `package.json`, `tsconfig.json`, `wrangler.toml` (template), ESLint/Prettier, Vitest
- [ ] `.gitignore`, `.dev.vars.example`
- [ ] `git init` + primeiro commit
- **Conclusão:** `npm install` e `npm test` rodam (mesmo que com 1 teste trivial).

## Fase 1 — Contratos (schemas)
- [ ] `src/schemas`: `DataPoint`, `QuantMetrics`, `ResearchOutput`, `Thesis`, `TradeCard`,
      `RedTeamVerdict`, `ValidationReport`, `MorningCall`.
- [ ] Validação em runtime (zod ou validador próprio) + testes de schema.
- **Conclusão:** um `TradeCard` sem campo obrigatório é rejeitado por teste.

## Fase 2 — Camada de dados (O GARGALO — maior prioridade)
- [ ] `docs/DATA_SOURCES.md`: matriz dado → fonte primária → alternativa → frequência → atraso
      → custo → licença → confiabilidade.
- [ ] Interface `DataProvider` padronizada; cada observação carrega `source`+`timestamp`+`as_of`.
- [ ] Conectores iniciais: BCB (SGS/Focus/PTAX), B3 (índices/DI), FRED, U.S. Treasury.
- [ ] Normalização de ativos/datas/fusos; cache em KV; detecção de `N/D`.
- **Conclusão:** snapshot datado real gravado em D1; dado faltante vira `N/D`, nunca inventado.

## Fase 3 — Motor quantitativo (funções puras, 100% testadas)
- [ ] Retornos (1D/5D/mês/ano/12m), vol realizada, drawdown, momentum, correlação, z-score,
      inclinação/curvatura de curva, inflação implícita, risco-retorno, stress.
- [ ] Testes com valores conhecidos (golden tests) — inclusive bordas (feriado, série curta).
- **Conclusão:** cobertura alta no `src/quant`; nenhum número depende de LLM.

## Fase 4 — Agentes (workers de análise)
- [ ] `agents/`: Research, MacroStrategist, BrazilStrategist, Technical, Credit,
      TradeConstructor, RedTeam, DataValidation, FinalEditor.
- [ ] `prompts/`: prompts fatiados do MORNING_CALL_OTIMIZADO por agente.
- [ ] Cada agente: input tipado, output JSON validado, timeout, fallback de modelo (OpenRouter).
- **Conclusão:** cada agente roda isolado com fixture e devolve JSON válido.

## Fase 5 — Orquestração
- [ ] `orchestrator/`: fan-out/fan-in, máx. 2 rodadas, orçamento de tokens, log de custo.
- [ ] Anti-ancoragem do red team (não recebe raciocínio do estrategista).
- **Conclusão:** run ponta-a-ponta com dados reais produz rascunho consolidado.

## Fase 6 — Comitê + Morning Call (MVP entregável)
- [ ] `committee/`: validador numérico/fontes + scoring determinístico.
- [ ] `report/`: montagem do relatório (Abertura + Painel + Motor de Oportunidades + Ranking +
      Rastreabilidade), conforme `MORNING_CALL_OTIMIZADO.md`.
- [ ] Checks automáticos: todo trade tem entrada/alvo/invalidação; probabilidades somam 100%;
      fontes presentes; sem números conflitantes; sem trades duplicados/correlacionados sem
      justificativa.
- **Conclusão:** Morning Call MVP gerado, salvo em R2, teses/trades em D1.

## Fase 7 — Avaliação (skill over time)
- [ ] Armazenar por tese: data, dados usados, modelo/versão, prompt, resposta, trade, entrada,
      alvo, stop, horizonte, resultado posterior, MAE, MFE, custos, acerto de direção, qualidade.
- [ ] Comparação de modelos ao longo do tempo.
- **Conclusão:** dá para medir qual modelo/tese acerta — e recalibrar o comitê.

## Fase 8 — Expansão para as 19 seções
- [ ] Completar as seções restantes do `MORNING_CALL_OTIMIZADO.md`.
- [ ] Fontes premium onde necessário (vol implícita, spreads secundários, fluxo).

---

## Ordem sugerida de ferramentas (multi-agente de código)
1. **Gemini CLI** pesquisa fontes/APIs/licenças → produz `docs/DATA_SOURCES.md` e `COST_ESTIMATE.md`.
2. **Claude Code** desenha e implementa (Fases 0→6).
3. **ZCode** faz tarefas isoladas (testes, mocks, conectores pontuais).
4. **Codex** revisa adversarialmente (segurança, cálculo, race conditions) → `CODE_REVIEW.md`.
5. Deploy só após testes + autorização humana. Branches separadas; nunca dois agentes na mesma.
