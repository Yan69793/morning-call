# PLANO_DEFINITIVO — Morning Call (v3, 2026-07-15)

> Síntese do melhor de todos os planos. Ordem de trabalho cotidiana.
> Estratégia: `PLANO_ESTRATEGICO.md`. Editorial: `MORNING_CALL_OTIMIZADO.md`.
> Arquitetura: `ARCHITECTURE.md`.

## Travas

- P1 = máquina de calls (alfa forward)
- Runtime = Worker TS; `quant.py` = golden only
- Snapshot-first → closed-book → QuantClaim → crossCheck → N/D → Traceability
- Kill: smoke 25 pregões (`DEFAULT_SMOKE_N`); **prova N = 100 trades** (`PROVA_N_TRADES`, travado
  16/07). Abaixo de 100, `promocao_autorizada = false` — não escala nem promove ao Portão 3
- Deploy sempre humano; proibido executar ordens

## Estado

| Peça                                        | Status                    |
| ------------------------------------------- | ------------------------- |
| Schemas + D1 + crossCheck + quant/core      | OK                        |
| metrics (PC-1 / Venue)                      | OK                        |
| data/ snapshot (BCB/FRED/UST)               | OK                        |
| orchestrator steps + report/mark/scoreboard | OK                        |
| multi-agente / 19 seções                    | adiado (Wave C, pós-kill) |
| Paper-trade live + secrets + D1 real        | operacional (humano)      |

## Ordem

1. A1 metrics Venue
2. A2 providers públicos + snapshot
3. A3 persist D1
4. A4 calendário
5. A5 index.ts
6. B offline: strategist mock, gates, persist, mark, scoreboard
7. Kill checkpoint no placar

## MVP Portão 1

Abertura + fatos/metrics + 0–7 trades + ranking + §18 + disclaimer.
Zero assimetria = "NÃO OPERAR É A MELHOR OPERAÇÃO".

## Wave C (só se kill passou)

RedTeam filtro; self-consistency; seções extras; dados pagos com tese.
