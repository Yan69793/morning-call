# Estado do projeto — Morning Call

Última atualização: 2026-08-17 (agente: Claude Code)

Leia este arquivo antes de começar qualquer trabalho, seja qual for o agente.
Atualize a data e os itens abertos ao fechar uma sessão que mudou o estado.
Não duplique conteúdo do CLAUDE.md nem do README.md: aqui fica só o ponto de
partida com os ponteiros.

## O que é

Sistema de inteligência de mercado que gera diariamente um Morning Call multimercados
(Brasil + global) para gestores profissionais, UHNW e family offices. Roda como Cloudflare
Worker (TypeScript), coleta dados reais e datados, calcula métricas em código e usa
orquestração hierárquica de LLMs (OpenRouter + Workers AI) para transformar cenário macro
em operações executáveis, condicionais e rastreáveis. Gera teses auditáveis, não executa
ordens nem move dinheiro. Vive num monorepo npm workspaces com o Radar Quant e o pacote
compartilhado de analytics, mais o pipeline irmão briefing-interno (Python 3.11, stdlib),
que roda fora do workspace npm.

## Estado em 2026-08-17

Pronto, conforme o CLAUDE.md: monorepo npm workspaces estruturado
(`apps/morning-call`, `apps/radar-quant`, `packages/analytics`), briefing-interno rodando
diariamente às 07h00 via Task Scheduler, portão de verificação definido para o monorepo e
para o briefing, e deploy sempre como ação humana explícita. Em produção: deploys de 14/08
dos dois Workers com CORS fail-closed e TRIGGER_SECRET criado, e P-05 em produção desde
17/08 (cron das 18:30 marca trades tipo "preco" com fonte de preço configurada).

O CLAUDE.md não tem seção própria de pendências. O registro real de pendências e perguntas
abertas é o PENDENCIAS.md (auditoria de 14/08, 80 achados após dedup; na sessão de 17/08
foram respondidas P-01, P-03, P-04, P-05 e P-09, abertas P-10 a P-15, e o RQ-34 foi
corrigido sem commit ainda). O detalhe de cada item está no próprio arquivo.

## Como verificar

Portão do monorepo (antes de declarar qualquer tarefa concluída, colar a saída real):

```
npm test && npm run typecheck && npm run lint
```

Portão do briefing (valida o HTML antes de enviar; substituir `YYYYMMDD` pela data):

```
python briefing-interno/scripts/validar_briefing.py briefing-interno/outputs/briefing_YYYYMMDD.html
```

## Onde está o resto

- `CLAUDE.md` — instruções globais do projeto (regras de infra, portões)
- `README.md` — visão geral, documentos e início rápido
- `ARCHITECTURE.md` — decisões de arquitetura e o porquê
- `IMPLEMENTATION_PLAN.md` — fases legadas
- `docs/DATA_SOURCES.md` — matriz de fontes de dados
- `docs/RUNTIME_AGENTS.md` — arquitetura de agentes de runtime
- `docs/planejamento/` — `PLANO_DEFINITIVO.md` (ordem de trabalho atual),
  `PLANO_ESTRATEGICO.md` (portões), `PLANO_EXECUCAO.md` (T1–T8) e
  `MORNING_CALL_OTIMIZADO.md` (contrato editorial do relatório)
- `PENDENCIAS.md` — registro de pendências e perguntas abertas da auditoria
- `apps/morning-call`, `apps/radar-quant`, `packages/analytics` — workspaces npm
- `briefing-interno/` — pipeline Python do briefing pessoal (CLAUDE.md próprio)

## Itens abertos

- Sem pendências abertas registradas no CLAUDE.md.
- Pendências e perguntas da auditoria em aberto (P-10 a P-15; RQ-34 corrigido mas não
  commitado na sessão de 17/08): ver `PENDENCIAS.md`.
