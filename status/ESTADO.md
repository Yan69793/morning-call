# Estado do projeto — Morning Call

Última atualização: 2026-08-19 (agente: Claude Code)

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
(`apps/morning-call`, `radar-quant-brasil`, `packages/analytics`), briefing-interno rodando
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
- `apps/morning-call`, `radar-quant-brasil`, `packages/analytics` — workspaces npm
- `briefing-interno/` — pipeline Python do briefing pessoal (CLAUDE.md próprio)

## Itens abertos

- Sem pendências abertas registradas no CLAUDE.md.
- Pendências e perguntas da auditoria em aberto (P-10 a P-15; RQ-34 corrigido mas não
  commitado na sessão de 17/08): ver `PENDENCIAS.md`.
- `briefing-interno/remote/` (Worker `sz-briefing-remote`): nenhuma, trava de segurança
  aplicada e commitada em 19/08. Ver seção abaixo.

## Estado do briefing-interno em 2026-08-18

Correção do `:online` concluída e commitada em `main` (075a806, "fix(briefing-interno):
desativa :online do OpenRouter e fecha entrega de 4 dias"). O sufixo de web search era
incompatível por construção com a REGRA 1 do validador, que exige toda URL citada no pool
RSS coletado localmente: 13, 14, 17 e 18/08 reprovaram no portão e ficaram sem entrega às
07h00. O validador ficou intocado, fail-closed preservado, e o `run_briefing.ps1` agora
tenta geração+validação em laço de 3 tentativas (o retry que o Yan já fazia à mão), sem
afrouxar regra nenhuma: sem aprovação, nada é enviado.

Prova do dia 18/08: rodada das 16:24 com `:online` reprovada na REGRA 1 (2 URLs fora do
pool), rodadas das 21:07, 21:10 e 21:39 sem o sufixo aprovadas de primeira, todas as URLs
no pool. Envio real às 21:06:49 confirmado pelo Resend (sentinela `sent_20260818.flag`).
As tasks `Szuchmacher-BriefingMatinal` (07h00) e `Szuchmacher-BriefingWatchdog` (07h20)
seguem Ready, e o `.env` usa `OPENROUTER_MODEL=google/gemma-3-27b-it` sem sufixo. Detalhe
no `briefing-interno/CLAUDE.md` e nos logs de `briefing-interno/logs/`.

## Estado do briefing-interno em 2026-08-19: fallback remoto

Sessão anterior (madrugada) deployou `briefing-interno/remote/` como Worker Cloudflare
(`sz-briefing-remote`, KV real, Durable Object, os 7 secrets aplicados) para cobrir o
cenário de PC desligado às 07h00, mas deixou o código sem commit e sem trava contra envio
automático. Esta sessão fechou os dois:

- Cron e watchdog do Worker mandavam e-mail real sozinho, sem revisão, contradizendo a
  proibição de reenvio automático que o Yan já tinha dado em 18/08. Trocado por
  segurar-e-avisar nos três pontos (cron principal, retry, recuperação do watchdog): o
  Worker gera, valida, nunca envia sozinho, e avisa por e-mail com instrução de como
  aprovar o envio manual. Commit `1f0c5c6`, publicado em `origin/main`.
- Testado de ponta a ponta com data sintética (nunca toca o estado real de hoje): ciclo
  completo rodou limpo, 55 feeds RSS, 5 URLs aprovadas, validação aprovada, nada enviado
  de verdade (modo seguro).
- Testes: 34/34 (`node --test` em `remote/`), rodado de verdade nesta sessão.
- Fora de escopo, não tocado: a reestruturação em andamento de `apps/radar-quant` para
  `radar-quant-brasil/` e as mudanças de config de raiz que estavam soltas na árvore
  antes desta sessão. O commit `1f0c5c6` cobre só os arquivos do `briefing-interno/`.

Nada pendente deste lado. Próximo teste real é o cron de hoje às 07:05 BRT (retry 07:35),
que deve ficar em silêncio porque o local reivindica primeiro; conferir depois pelo
`GET https://sz-briefing-remote.prospects-intel.workers.dev/health`, sem testar de novo
por cima.
