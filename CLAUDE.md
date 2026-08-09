# CLAUDE.md — Morning Call + Radar Quant (hardened 2026-07-25)

Monorepo npm workspaces: `apps/morning-call/`, `apps/radar-quant/`, `packages/analytics/`.
Documentos irmãos: `ARCHITECTURE.md`, `IMPLEMENTATION_PLAN.md`, `docs/DATA_SOURCES.md`.

## briefing-interno/ — Briefing pessoal do Yan

Pipeline Python 3.11 (stdlib, zero dependencias) que roda via Task Scheduler as 07h00 em dias uteis. Coleta noticias, consulta estado dos Workers, gera briefing via OpenRouter, valida e envia por Resend. Nao faz parte do workspace npm. Detalhes em `briefing-interno/CLAUDE.md`.

Portão de verificacao do briefing (antes de declarar tarefa concluida la):
```
python briefing-interno/scripts/validar_briefing.py briefing-interno/outputs/briefing_YYYYMMDD.html
```
Substituir `YYYYMMDD` pela data. Se reprovar, nao enviar.

## Regras de infra

- `CORS_ORIGINS`: fail-closed. Se a variável sumir ou estiver vazia, negar todas as origens. Nunca `*` como fallback.
- Função de cálculo financeiro (retorno, vol, z-score, drawdown, correlação): verificar `packages/analytics` antes de implementar. Funções puras já existem lá com disciplina de null vs zero.
- Nunca fazer deploy automático. Deploy é ação humana explícita.

## Portão de verificação

Antes de declarar qualquer tarefa concluída, execute:
```
npm test && npm run typecheck && npm run lint
```
Cole a saída real na resposta. Se falhar ou não puder executar, diga explicitamente. Nunca declare "funcionando" sem a saída colada.
