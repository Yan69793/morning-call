# Cloudflare — inventário de recursos (Morning Call, Radar Quant, Fechamento Diário)

Levantamento de 17/08/2026. Escopo restrito aos três projetos que se cruzaram numa mesma sessão
de trabalho: o Worker `szuchmacher-briefing` apareceu como se fosse órfão do Morning Call quando
na verdade pertence a outro produto. A conta Cloudflare do Yan tem cerca de 19 recursos ao todo
(Workers + Pages); os que não aparecem aqui são de outros projetos (BTC Radar, Tapetier, Carreira
Executiva, Jornada Interior, Árvore das IAs, Verificação de Carteiras, entre outros) e ficam fora
do escopo deste documento.

Fonte de cada linha: API da Cloudflare (`workers_list`, `d1_databases_list`, `kv_namespaces_list`,
`r2_buckets_list`) e leitura direta de `wrangler.toml` / código publicado, não suposição.

## Morning Call (`apps/morning-call`, neste repo)

| Recurso | Nome / ID | Observação |
|---|---|---|
| Worker | `morning-call` (`cb28193fc2f84aee8a73f84842761608`) | Backend, orquestrado por Cloudflare Workflows, cron 06:30 e 18:30 BRT |
| D1 | `morning-call` (`c9a7fda3-ce3d-4295-96ed-0d2753d21f5b`) | O comentário no `wrangler.toml` chama de "placeholder" — está desatualizado, é o ID real de produção |
| R2 | `morning-call-reports` | Relatórios diários, D1 guarda só o ponteiro |
| Domínio | `morning-call.prospects-intel.workers.dev` | |

## Radar Quant Brasil (`apps/radar-quant`, neste repo)

| Recurso | Nome / ID | Observação |
|---|---|---|
| Worker | `radar-quant-brasil` (`502a26b0e8344057994ac5412f6f6baf`) | API + ingest do scan diário via TradingView |
| Pages | `radar-quant-brasil` | Frontend, domínio `radar-quant-brasil.pages.dev`, conectado via Git a este repo. Deploy automático **pausado** — surpresa pro Yan em 17/08, motivo não investigado |
| D1 | `radar-quant` (`5ded6d78-e82b-4d25-8a43-b5e100785405`) | |
| KV em uso | `RADAR_KV-legacy` (`d7723f25facd419e92f7062ae25acceb`) | É o ID que o `worker/wrangler.toml` atual referencia (binding `KV`), apesar do nome de exibição ter ganhado o sufixo "-legacy" |
| KV não referenciado por este repo | `RADAR_KV` (`c6805b8d8a7b468e9f854ab4f91fb93a`) | Nome mais "limpo", ID diferente do que o `wrangler.toml` deste repo usa. Não achei de onde vem — hipótese: é o KV do `radar-dashboard` (linha abaixo), não confirmado |

**`radar-dashboard`** (Worker, `3c121154913e4ebdb5169e77f115a433`, criado 15/06 14:36 UTC, última alteração 17/06 20:49 UTC, sem nenhuma referência neste repo): pelo código publicado, é um protótipo completo e autocontido do Radar Quant — um único Worker que recebe scan via `/ingest` com HMAC próprio e renderiza o dashboard em HTML server-side, sem frontend separado. O `radar-quant-brasil` nasceu no mesmo dia, 26 minutos depois (14:36 → 15:02), já com a arquitetura atual (Worker de API + Pages separados). Leitura mais provável: `radar-dashboard` foi o primeiro rascunho, abandonado em menos de 48h quando a arquitetura atual começou, e nunca foi apagado. Não confirmado com o Yan.

## Fechamento Diário / relatorio-diario-szuchmacher (projeto fora deste repo)

| Recurso | Nome / ID | Observação |
|---|---|---|
| Worker | `szuchmacher-briefing` (`1bf0b671370f46089aac738257d753ab`) | Proxy de hospedagem de HTML em `szuchmacher.com.br`, rotas `/upload/<slug>` e `/fechamento/<slug>` |
| KV | `SZUCHMACHER_BRIEFING_KV` (`9e9696d012234920bf2d6129b4fdcb72`) | Binding `BRIEFING_KV` no código do Worker |
| Repo local | `E:\Diretorio\Claude\FREQUENTE\relatorio-diario-szuchmacher\` | Fora do monorepo Morning Call. Mencionado de passagem em `briefing-interno/CLAUDE.md` |

Zero tráfego observado nos últimos 14 dias via Workers Observability (checado 17/08). Não
investiguei o projeto `relatorio-diario-szuchmacher` pra saber se isso é esperado agora.

## O que este levantamento não resolveu

1. **Duas KV com nome parecido no Radar Quant** (`RADAR_KV` vs `RADAR_KV-legacy`) — qual é a fonte de verdade atual, e se a outra pode ser apagada.
2. **Deploy automático do Pages pausado** sem explicação conhecida.
3. **`radar-dashboard`** é o mesmo tipo de pergunta que já existia pro `szuchmacher-briefing` (P-01): manter, investigar mais, ou apagar o protótipo abandonado.

Este documento só mapeia. Nenhum recurso foi movido, renomeado ou apagado para produzi-lo.
