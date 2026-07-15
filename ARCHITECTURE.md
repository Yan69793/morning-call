# ARCHITECTURE.md — Decisões de Arquitetura

Registro das decisões estruturais, o porquê de cada uma e as alternativas rejeitadas. Não
reabrir sem evidência nova (preferência do projeto: só revisar posição diante de novas evidências).

---

## AD-1 — Runtime: Cloudflare Workers (estender o VixRadar), não Python/Docker

**Decisão:** o sistema roda como Worker(s) em TypeScript, reutilizando a infra do VixRadar
(Workers/Pages/KV/D1/R2 + cascade OpenRouter).

**Por quê:**
- Você **já opera** essa stack. Erguer um mundo Python (FastAPI/Postgres/Redis/Docker/LangGraph)
  paralelo dobra a superfície de manutenção sem ganho proporcional para uma carga que roda 1x/dia.
- Modelos de ponta hoje jogam a favor do edge: **Kimi K2.6 roda no Cloudflare Workers AI**;
  **GLM-5.2** e **DeepSeek V4** saem baratíssimos via **OpenRouter** (mesma chave do VixRadar).
- Cron Trigger nativo cobre o agendamento 06:30 BRT.

**Rejeitado:** stack Python dedicada (mais controle quant, porém infra redundante); híbrido
(quant em Python + edge) — reservado para *se e quando* o motor quant provar ser pesado demais
para TypeScript, o que é improvável para as métricas necessárias.

**Risco aceito:** ecossistema quant em TS é mais pobre que pandas/numpy. Mitigação: as métricas
do Morning Call são elementares (retorno, vol, z-score, drawdown, correlação, inclinação de
curva, breakeven) e implementáveis/testáveis em TS sem dor.

---

## AD-2 — Orquestração hierárquica, 2 rodadas, não swarm paralelo de 4 frontier

**Decisão:** supervisor-worker com fan-out para análise e fan-in para validação; máximo 2 rodadas;
comitê determinístico em código. Ver `AGENTS.md`.

**Por quê:** benchmark 2026 de arquiteturas multi-agente em finanças coloca o padrão hierárquico
na fronteira de Pareto (F1 ~0.92 a ~1.4x custo); fan-out paralelo puro é mais caro e sofre de
falso-consenso. Diminishing returns acima de ~US$1/pergunta. Roteamento + cache recuperam ~89%
do ganho a ~1.15x do custo.

**Rejeitado:** 4 modelos frontier debatendo livremente (custo alto, falso-consenso, latência).

---

## AD-3 — Dados são o gargalo; LLM nunca produz número

**Decisão:** camada de dados determinística com `source`+`timestamp` em cada observação; motor
quant em código; LLMs só interpretam. Dado sem fonte → `N/D — REQUER VERIFICAÇÃO`.

**Por quê:** o melhor agente financeiro medido acerta <50% das tarefas; a fragilidade vem de
dado ruim e imprecisão numérica, não de "pouca inteligência" do modelo. Ver `docs/DATA_SOURCES.md`.

---

## AD-4 — Modelos via OpenRouter + Workers AI

**Decisão:** OpenRouter como camada principal (1 chave: GPT-5.6, Gemini 3.1 Pro, Claude Opus
4.7, GLM-5.2, DeepSeek V4); Kimi K2.6 via Workers AI para tarefas agênticas baratas.

**Roteamento por criticidade:** estrategista/red team/editor → frontier; técnico/auditoria/
formatação → GLM-5.2 / DeepSeek / Kimi.

---

## Fluxo de dados (alto nível)

```
Cron → Worker orquestrador
  → data/ (fetch BCB SGS, Focus, PTAX, B3, ANBIMA, Tesouro, FRED, U.S. Treasury, CME, mercado)
  → KV (cache) + D1 (snapshot datado)
  → quant/ (métricas determinísticas) → D1
  → agents/ (fan-out via OpenRouter/Workers AI)
  → committee/ (validação + scoring, em código)
  → report/ (FinalEditor monta o Morning Call)
  → R2 (relatório) + D1 (teses/trades p/ avaliação) + entrega (e-mail/dashboard VixRadar)
```

---

## Estimativa de custo (ordem de grandeza, calibrar em `docs/COST_ESTIMATE.md`)

> Preços de API por 1M tokens (jul/2026, verificados): GPT-5.6 Sol $5/$30, Terra $2.50/$15;
> Claude Opus 4.7 ~$5/$25; GLM-5.2 ~$1.00/$4.00 (OpenRouter); DeepSeek V4 Pro ~$0.435/$0.87;
> Kimi K2.6 open-weight (Workers AI). Gemini 3.1 Pro com Deep Research à parte.

Um run/dia com roteamento (frontier só onde importa) deve ficar em **poucos dólares/dia** —
muito abaixo do limiar de retorno decrescente. O maior custo real tende a ser **dados de
qualidade institucional** (vol implícita, curva intraday, spreads de crédito secundário, fluxo),
não os tokens. Priorizar isso em `docs/DATA_SOURCES.md`.

---

## Pendências que ainda precisam de decisão

1. **Fontes de dados pagas vs. gratuitas** — o item de maior impacto. (Fase 2 / `DATA_SOURCES.md`.)
2. Formato de entrega final: e-mail, painel no VixRadar, PDF em R2, ou os três.
3. Fuso/horário exato do cron e calendário de feriados (B3 + US).
