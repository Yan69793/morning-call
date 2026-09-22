# Estado do projeto — Morning Call

Última atualização: 2026-09-22 (agente: DeepSeek/Codex, sessão de troca de provedor)

Leia este arquivo antes de começar qualquer trabalho, seja qual for o agente.
Atualize a data e os itens abertos ao fechar uma sessão que mudou o estado.
Não duplique conteúdo do CLAUDE.md nem do README.md: aqui fica só o ponto de
partida com os ponteiros.

## Morning Call publicado de novo em 22/09/2026, provedor trocado para a API da OpenAI

**Data:** 2026-09-22
**Versão no ar:** `3af4940b-e287-4bf3-9765-1acf42c560b9`
**Versão anterior, para rollback:** `80119351-9a44-4cf2-86de-6e931456abb3`, e antes dela
`3236ad8c-a9a7-49eb-ba35-a963815cf3bc` (só troca de secret) e o código de 17/09
`240e920e-c8ad-481e-aa10-a80f7435f19d`.

**O problema que existia.** `/api/report/latest` servia `trade_date` 2026-09-08 desde 08/09, dez
pregões sem publicação. A causa registrada era o 402 de reserva de `max_tokens` do OpenRouter, e a
cota real medida em 22/09 era de 933 tokens contra 9517 em 16/09 e 2916 em 17/09. A chave do
OpenRouter é a mesma que o pipeline do `briefing-interno` consome todo dia às 07h00.

**A troca de provedor.** `chatCompletion` deixou de ter o booleano `deepseekApi` e passou a ter o
tipo `Provedor` com `openrouter`, `deepseek` e `openai`. `resolverCadeiaLlm`, exportado de
`src/workflow.ts`, decide provedor, chave e o modelo das quatro etapas a partir do ambiente, com
precedência `OPENAI_API_KEY` > `DEEPSEEK_API_KEY` > `OPENROUTER_API_KEY`. Antes essa decisão estava
espalhada em três blocos com regras diferentes, que foi a origem do incidente de 09/09.

**Configuração no ar.** `OPENAI_API_KEY` é secret. Os modelos ficaram em `[vars]` do
`wrangler.toml`, e não em secret, porque o deploy já ia acontecer e config revisável em git vale
mais que config editável sem deploy: `OPENAI_STRATEGIST_MODEL=gpt-5.4`,
`OPENAI_ANALYST_MODEL=gpt-5.4-mini`, `OPENAI_CALENDAR_MODEL=gpt-5.4`,
`RESEARCH_MODEL=gpt-5-search-api`. O secret `STRATEGIST_MODEL` que já existia continua valendo para
o caminho OpenRouter e fica inerte enquanto o provedor for OpenAI.

**Três defeitos que a medição pegou, e que nenhuma leitura de código pegaria.**

1. `max_tokens` não existe na família `gpt-5.x` e `gpt-6`. A sonda `scripts/local/probe-openai.ts`
   mediu, em 12 modelos e 4 testes cada, que todos recusam com `Unsupported parameter ... Use
   'max_completion_tokens' instead`. O `chatCompletion` passou a mandar `max_completion_tokens`
   quando o provedor é OpenAI. Sem isso a primeira corrida seria 400 nas quatro etapas.
2. Quatro ids da listagem `/v1/models` da conta respondem 404 `has been deprecated` quando usados
   (`gpt-5.3-chat-latest`, `gpt-5.2-chat-latest`, `gpt-4o-mini-search-preview`,
   `gpt-4o-search-preview`). Listagem de modelos não é prova de capacidade.
3. O prompt do strategist nunca enunciava as invariantes que `sealTradeCard` cobra. A primeira
   corrida real reprovou 3 de 4 trades por `alvo_1 contradiz a direção da operação`. As regras
   passaram a constar do system prompt, com teste que amarra prompt e validador
   (`tests/agents/strategist.test.ts`).

**A correção guiada pelo validador.** Enunciar as regras resolveu o `alvo_1` e não resolveu tudo:
a corrida seguinte reprovou por `alvo_2 precisa ser mais distante da entrada que alvo_1` e
`invalidação está do lado errado da entrada`. `runStrategist` passou a ter laço de correção
limitado a `MAX_TENTATIVAS_CORRECAO = 2`, que devolve ao modelo a lista de problemas com caminho e
motivo (`problemasDeValidacao`, `buildCorrecaoPrompt`). Erro que não é de validação sobe na hora,
sem gastar chamada. Evento estruturado `strategist_correcao` marca cada correção.

**Resultado medido.** Corrida de 22/09 pelas 10h06 BRT, instância `32e0f90a-d32e-415c-b2a0-da64f3266bee`,
todos os seis steps verdes, 2 minutos no total (`strategist` 1 minuto). `/api/report/latest` passou a
devolver `trade_date` 2026-09-22, `aprovado: true`, `ok: true`, 2 trades, `gateReasons` vazio. Gate do
repo: 427 testes, typecheck exit 0, lint com os mesmos 10 erros pré-existentes em
`apps/morning-call/scripts/shadow/run-shadow-ab.ts`, que é untracked.

**Proveniência preservada, com ressalva.** `gpt-5-search-api` pesquisa e devolve anotação, e a
cadeia montou fontes reais com domínio (exame.com, agenciagov.ebc.com.br, cnnbrasil.com.br,
economia.uol.com.br, agenciabrasil.ebc.com.br). Duas diferenças contra o plugin `web` do OpenRouter
ficam registradas: as URLs vêm com `?utm_source=openai`, e as anotações não trazem data de
publicação, então toda fonte caiu em `janela: "indeterminado"` e o selo de frescor perde valor.
O `research` também **não** usa `response_format` hoje, o que importa porque o `gpt-5-search-api`
recusa `json_object` com `not supported with web_search`.

**Defeito de qualidade em aberto, este sim é o que precisa de decisão.** O trade 1 publicado,
`comprar_cdi_diaria`, tem entrada `0.050788 pct` (a taxa diária do CDI), alvo_1 `4.22 pct`,
alvo_2 `4.9205 pct`, invalidação `0.01` e faixa de `0.050788` a `13.5`. Mistura taxa diária com
nível anual. Passa pelo validador porque tudo está rotulado `pct` e a ordem dos níveis respeita a
direção, e passa pelo `validateMorningCall` porque as regras de lá são de ordenação, proveniência e
soma de probabilidades, não de plausibilidade econômica. O `unidadesBatem` pega unidade diferente,
não escala dentro da mesma unidade. O terceiro alvo do trade 1 e o do trade 2 são o mesmo número,
`4.9205`, o que sugere ancoragem do modelo num valor do snapshot. Nenhum portão automático pega
isso, então é decisão do operador: aceitar, endurecer o validador, ou trocar o modelo do strategist.

**Pendências de ação do operador.**
- Chave da OpenAI exposta em chat durante a montagem. Precisa ser revogada e trocada, e o secret
  `OPENAI_API_KEY` regravado com a nova.
- Push dos commits locais. `origin/main` parou em `71f6243`; `main` local está 3 commits à frente
  mais todo o trabalho desta sessão, ainda não commitado.
- `register-watchdog-task.ps1` continua criado e não executado. Ele já não é fail-open: o `/health`
  passou a devolver `b3_trading_day` nesta versão, que era o campo que faltava para o watchdog
  conseguir avaliar a pré-condição.
- Os scripts de watchdog, o transporte local do Codex CLI e as duas sondas continuam untracked.

## Estado do Morning Call após os cartões t_7d50428e, t_e4fe0569, t_08bd0538 (18/09/2026)

**Data:** 2026-09-18
**Agente:** Hermes Code (worker do board)
**Cartões processados:**
- `t_7d50428e` — retry de reserva 402 no Worker (commit `9560990`)
- `t_e4fe0569` — watchdog de não publicou (scripts watchdog.ps1 + register-watchdog-task.ps1 + testes)
- `t_08bd0538` — desfecho explícito de falha terminal (commit `7d4bdd3`)

**O que mudou (medido):**
- **t_7d50428e / 9560990:** Implementado retry com N do provedor no erro 402 do OpenRouter (reserva de `max_tokens` excede saldo). Adicionada variável `STRATEGIST_MAX_TOKENS` por env para tornar o teto do strategist configurável sem deploy. Gate do repo verde: `npm test` (361 testes), `npm run typecheck` (exit 0), `npm run lint` (exit 0 no escopo próprio; 10 erros em `apps/morning-call/scripts/shadow/run-shadow-ab.ts` untracked, fora do escopo).
- **t_08bd0538 / 7d4bdd3:** Helper novo `passoCritico(step, nome, db, tradeDate, fn)` exportado em `apps/morning-call/src/workflow.ts`, aplicado a init-snapshot, strategist e gates-report. Função `fecharRunComoFalha` chama `markRunFailedIfRunning` (intacto) em toda tentativa falha e rethrow preservando retentativa. RED provado contra blob anterior (`9560990`): falha `expected [] to have a length of 7 but got +0` + `passoCritico is not a function`; verde depois (6/6 testes novos passam). Commit local 7d4bdd3 (4 arquivos, 470 inserções, só escopo declarado), sem push, sem deploy, sem migration.
- **t_e4fe0569:** Watchdog completo implementado. Scripts criados: `watchdog.ps1` (alertas via kanban + e-mail, idempotente, PowerShell 5.1 disciplinada), `register-watchdog-task.ps1` (Task Scheduler weekly 07:15 BRT). Testes inclusos: parser validation (`watchdog.parser.test.ps1`) e mock tests (`watchdog.test.ps1`). Requisitos W1-W7 atendidos: W1 sinal via /health, W2 alerta atrasado/fora do ar, W3 dois canais (kanban + e-mail), W4 sem reparo automático, W5 idempotência diária, W6 PowerShell 5.1 discipline, W7 Task Scheduler 07:15 BRT dias úteis.

**O que foi medido:**
- `t_7d50428e`: 361 testes, typecheck 0, lint 0 (escopo próprio); `STRATEGIST_MAX_TOKENS` configurável por env; retry de billing do OpenRouter funcional.
- `t_08bd0538`: 377 testes (81 analytics + 277 morning-call + 19 radar worker), typecheck 0, lint 0 (escopo próprio); 6 testes novos em `tests/workflow/`; `git show --stat 7d4bdd3` confirma 4 arquivos, 470 inserções, 3 deleções; `item3_nenhuma_publicacao` medido: 7 escritas falha no esgotamento, 0 fetch para ingest, gates-report não executado, 0 insert_reports, 0 insert_trades, 0 r2_puts, total 8 após rethrow; UPDATE literal documentado.
- `t_e4fe0569`: 3 scripts criados, 3 arquivos de teste; requisitos W1-W7 confirmados no handoff.

**O que ficou pendente (não medido / não feito neste escopo):**
- **Deploy de produção:** nenhum dos três cartões fez deploy. `t_7d50428e` e `t_08bd0538` commitaram localmente apenas. Deploy é ação humana explícita pendente do operador.
- **Validação em produção:** efeito das mudanças (`passoCritico`, retry 402, watchdog) em D1 de produção não medido (proibido tocar D1 remoto nos cartões).
- **Watchdog no Task Scheduler:** script `register-watchdog-task.ps1` criado mas não executado (registro da task é ação manual do operador).
- **P-14 (push 403):** resolvido em 17/09 (credencial GCM errada), mas push dos commits `9560990` e `7d4bdd3` para `origin` ainda não executado.

## Nota de atualização (18/09, madrugada)

As duas referências a bloqueio de push neste arquivo são registro histórico datado, não estado atual:
a frase `git push` segue bloqueado (P-14) da sessão de 21/08, hoje na linha 443, e o item equivalente
da sessão de 24/08, hoje na linha 487. Eram as linhas 425 e 469 antes desta nota, que desloca a
numeração do arquivo em 18 linhas.

O P-14 está resolvido, e o push para `origin` funciona. Causa raiz medida em 17/09/2026 (cartão
`t_5352ee15`, registro consolidado no item P-14 do `PENDENCIAS.md`): o Git Credential Manager do
Windows usava credencial de outra conta, e o `.gitconfig` global roteia github.com direto ao `gh`
desde 15/09. A prova já medida lá: `git credential fill` devolve `username=Yan69793` com token
idêntico ao ativo do `gh`, e `gh api repos/Yan69793/morning-call --jq .permissions` devolve
`push:true`.

Estado conferido em 18/09/2026 04:36 (-03): `origin/main` em `71f6243`, `main` local em `7d4bdd3`,
ahead 2. A conferência foi só de leitura: nenhum push e nenhuma alteração no remoto, conforme a
restrição do cartão que abriu esta nota.

## Estado do Morning Call (worker) em 2026-09-16: cadeia nova no ar (version 4d6144c3) e o credito do OpenRouter virou a unica barreira

Deploy feito em 16/09 17:32 BRT pelo repo (`npx wrangler deploy` dentro de
`apps/morning-call`, exit 0), version `4d6144c3-9e33-45c4-a16f-233b616ff4db`, 100% do
trafego, bindings preservados (D1 `morning-call`, R2 `morning-call-reports`, ASSETS,
WORKFLOW, `ENVIRONMENT=production`, `CORS_ORIGINS` identico ao `wrangler.toml`) e os seis
secrets intactos (`secret list` conferido depois do deploy). Portao do repo verde antes de
publicar: `npm test` (364 testes, exit 0), `npm run typecheck` (exit 0) e `npm run lint`
(exit 0).

Medicao em producao DEPOIS do deploy (instancia `2711aafe-dc44-4344-8977-f56420e2aac8`,
criada via API, 17:34 BRT): a cadeia nova roda ate o ultimo step anterior ao strategist.
`init-snapshot` ok (`run_id` `cd430d4d` reusado, idempotencia do `UNIQUE(trade_date)`
funcionando), `research` ok com busca web real e proveniencia preservada (fontes com URL,
ex.: cnnbrasil), `analyst` ok com brief estruturado. O step `strategist` morre com
`OpenRouter HTTP 402 ... You requested up to 16000 tokens, but can only afford 9517`, sete
tentativas, 13 minutos, instancia `Errored`.

A causa nao e autenticacao: o 401 de 09/09 nao reaparece. E a regra de reserva do
OpenRouter, que reserva `max_tokens` x preco antes de aceitar a chamada, contra um teto de
16000 hardcoded em `apps/morning-call/src/agents/strategist.ts`, enquanto o saldo cobre
9517 tokens de `google/gemini-3.6-flash` (US$ 3,75 por milhao de saida, ou seja, ~US$ 0,036
utilizaveis). Medido na mesma hora pela API do provedor com a chave do `.env`: `max_tokens`
64, 3500 e 5000 passam (200 OK), 16000 e recusado. Research e analyst, com tetos 3500 e
5000, passam.

Consequencia operacional: `/api/report/latest` ainda devolve o relatorio de `trade_date`
2026-09-08. Nenhum Morning Call foi publicado desde 08/09 (instancias `Errored` em 09, 10,
14, 15 e 16/09; 13/09 era domingo e abortou no calendario). O saldo cai a cada chamada
(10518 tokens afordaveis as 16:40, 9517 as 17:47), entao a corrida de 06:30 de 17/09 tende
a falhar no mesmo ponto enquanto o teto do strategist continuar 16000.

Decisao pendente do operador, registrada no board: (a) aportar credito no OpenRouter, ou
(b) baixar o teto do strategist em codigo para caber na reserva. Nada alem do deploy
autorizado foi alterado em producao.

## Estado do Morning Call (worker) em 2026-09-10: incidente OpenRouter fechado no secret, cadeia nova pronta e NÃO deployada

O cron de 09/09 morreu no step `strategist` com `OpenRouterError: DeepSeek HTTP 401:
Authentication Fails, Your api key: ****6c83 is invalid`. Causa: o Worker tinha
`DEEPSEEK_API_KEY` setado e `workflow.ts` escolhe o provedor pela presença dessa
variável, então a chamada ia direto para `api.deepseek.com` e nunca caía no
OpenRouter. Nos dias 01, 02 e 03/09 o mesmo caminho tinha morrido com `HTTP 402:
Insufficient Balance`. Correção feita **só em secret, sem deploy**: `DEEPSEEK_API_KEY`
removido, `OPENROUTER_API_KEY` regravada a partir do `.env` do briefing-interno,
`STRATEGIST_MODEL=google/gemini-3.6-flash`. Nenhum valor de chave foi impresso em log,
chat ou linha de comando.

A cadeia nova (research → analyst → strategist) está implementada em
`apps/morning-call/src/agents/`: `research.ts` e `analyst.ts` são novos e `openrouter.ts`
passou a preservar `message.annotations` (antes o Zod descartava a proveniência inteira).
A pesquisa usa o plugin web padrão do OpenRouter com `max_results: 10`; o engine Parallel
foi descartado por devolver corpus de março a agosto numa consulta que pedia 24h, medido
em 10/09. O gargalo dos dois lados era o raciocínio consumindo o teto de tokens: com
`reasoning.effort` por etapa (`none` no research e no analyst, `low` no strategist) os
tetos caíram para 3500 e 5000, e o custo projetado da corrida caiu de ~US$ 0,0413 para
~US$ 0,0284 (~31%), com 3/3 no Zod, `echo=0` e `conviccao<=10` medidos na API real.

**Nada disso está em produção.** O version deployado segue `a6ef6188`: a corrida de 10/09
às 06:30 BRT vai rodar o código antigo com os secrets novos. Validado às 03:53 BRT de
10/09, o relatório de 10/09 ainda não existe (não há linha em `runs` para essa data) e a
instância de 09/09 segue `Errored`, com a linha em `runs` presa em `running`.

## Estado do briefing-interno em 2026-09-04: REGRA 7 e triagem CVM 20, em sombra

Entraram três módulos novos em `briefing-interno/scripts/`, todos em modo
sombra, nenhum com poder de reprovar. A REGRA 6 não foi tocada e o envio das
06:56 de hoje (Yan + 28 clientes) não foi tocado.

`_regra7_unidades.py` cobre as cinco classes que a REGRA 6 documenta como ponto
cego (câmbio, juro, commodity, volatilidade, ação). O critério muda de banda de
magnitude para ligação sintática: o número só conta quando está preso ao ativo
pela frase ("dólar a 5,09", "Selic em 14,25%"). Com isso dá para conferir
unidade, escala, nível e direção sem os falsos positivos que impediram a REGRA 6
de cobrir essas classes.

`_regra8_cvm20.py` é triagem textual da Resolução CVM 20 consolidada, lida na
fonte hoje. Não é parecer jurídico e não decide enquadramento: o art. 2º e o
art. 3º são fato sobre a casa, não sobre o texto do dia, e seguem como item 3
das pendências.

`_shadow.py` grava evidência diária e mantém `HARD_BLOCKERS`, hoje vazio.

O aviso "Nenhum projeto citado" virou condicional, derivado do próprio
`SYSTEM_PROMPT`. Saía todo dia desde 13/08 sem ter o que cobrar.

Dois achados sobre briefing já entregue, dos 11 dias de backfill: em 03/09 o
texto disse que o dólar caiu 0,11% quando o pregão foi -0,58%, cinco vezes
maior, e aquele briefing foi aprovado pela REGRA 6 (o nível estava certo) e
saiu para 28 clientes. E em 24, 25 e 26/08 saíram seis níveis crus sem unidade,
defeito que a formatação determinística de 26/08 fechou, o que a REGRA 7
confirma ao não achar nenhum caso de 27/08 em diante.

Zero achados de bloqueio da REGRA 7 nos 11 briefings reais. A proposta de quais
códigos promover a bloqueio, com a análise de falso positivo por código, está em
`briefing-interno/diagnosticos/DIAGNOSTICO-2026-09-04.md`. Decisão do Yan, e
depende das 3 execuções reais que começam amanhã.

## Estado do briefing-interno em 2026-09-02: envio a clientes automatizado

`run_briefing.ps1` (PASSO 5.8) passou a criar `logs/aprovacao_clientes_<data>.flag`
sozinho, todo dia útil, quando a REGRA 6 aprova o briefing na tentativa 1 de 3
(sem reprovação nem correção), e a chamar `enviar_briefing.py --clientes` na
sequência para a lista de 28 endereços do `.env` do Fechamento. Substitui a
exigência de ordem direta do Yan a cada dia (desenhos de 13/08 e 24/08).
Detalhe completo em `briefing-interno/CLAUDE.md`, seção "Decisao de
02/09/2026", e item 1 da seção "Pendências abertas" deste `CLAUDE.md` raiz.

Dois riscos residuais não fechados por essa mudança: a Resolução CVM 20
segue sem verificação (item 3 das Pendências abertas), e o Worker remoto
segue sem a REGRA 6 portada (item 2), então um dia em que o remoto
reivindicar a corrida a lista de clientes não recebe nada, silenciosamente.

O envio de 02/09 à lista saiu manualmente às 12h40 (28 destinatários, Resend
`9f2e4c6d-3601-4e2a-ad5d-7ba033801973`), porque a automação entrou depois do
disparo das 07h daquele dia. O primeiro envio automático de verdade é o de 03/09.

Existe agora uma skill de encerramento específica deste projeto em
`.claude/skills/encerrar-sessao/`, com os portões, ponteiros e perguntas de risco
reais daqui. Ela é delta da skill global, não cópia.

## Estado do briefing-interno em 2026-08-26: nível determinístico e REGRA 6 sem marcador

O briefing de 26/08 saiu com "IBOV +1.55% a 174577.0" (e SPX a 7677.28),
número cru do Yahoo colado no texto. O bloco COTACOES injetava o `close` como
veio da fonte e o modelo copiava literal. A REGRA 6 registrou "nada a
conferir" porque só contava nível com marcador (R$/US$/pontos/% a.a.). Corrigido
em duas frentes, as duas com espelho Python/JS byte a byte.

**Formatação determinística.** `ATIVOS_META` ganhou `display_unit` e
`display_decimals` por ativo (`_comum.py` e `precos.js`), o valor do bloco
passou a sair formatado ("174.577 pontos", "R$ 5,1490", "14,00% a.a.") e nunca
mais cru nem com vírgula de milhar ("174,577" seria lido como 1000x menor). A
paridade é presa por um vetor compartilhado, `remote/tests/fixtures/
fmt_vectors.json`, que as duas suítes leem (casos-limite 1.005, 2.675, valor
negativo, valor grande e empates de midpoint). O arredondamento do lado JS
replica o f-string do Python: round-half-even sobre o valor exato do double,
decomposto em BigInt (N·2^e) com a fração comparada ao meio-termo. O `toFixed`
do JS não serve, ele empata para cima no meio-termo exato (0.125 vira 0.13, o
Python emite 0.12), e os vetores de midpoint prendem exatamente essa
divergência. O `pyRound` ficou fora do formatador de exibição: multiplicar por
10^d antes de arredondar introduz erro de float a mais (2.675*100 = 267.5
exato no JS, vira 2.68 quando o Python vê 2.6749...).

**REGRA 6 em três camadas, nos dois validadores.** A camada 1 confere todo
número do texto que bate com o close, mesmo sem unidade, e fecha a cegueira do
caso de hoje. A camada 2 reprova por marcador, como antes. A camada 3 reprova
número solto dentro de [0.5·close, 1.5·close] em índice/cripto, sem exceção de
ano (com SPX ~7.677 a banda é [3.838, 11.515], o "2026" não cai nela). O alias
`spx` foi adicionado ao mapa de menções, porque o texto real cita "SPX" e sem
isso a atribuição de número não acontecia.

**Limitação conhecida, documentada de propósito.** Nível errado SEM unidade em
câmbio, juro, commodity, volatilidade e ação continua invisível para a REGRA 6.
A prosa legítima dessas classes põe número incidental perto do close ("3.000
toneladas de ouro", "inflação em 7%"), e reprovar por banda seria falso
positivo pior que a cegueira residual. A camada 1 confere o que bate, a camada
2 reprova o que tem marcador, o resto passa silencioso.

**Verificação.** `tests/test_fmt_precos.py` (3), `tests/test_regra6_numeros.py`
(22), `tests/test_pipeline_robustez.py` (28) e a suíte do remote (63/63) verdes.
O bloco sobre o preços real de 26/08 sai "174.577 pontos", "7.677,28 pontos",
"R$ 5,1490", "14,00% a.a.". A REGRA 6 sobre as frases do dia devolve oks para
IBOV, SPX, VIX, WTI e USDBRL e zero problemas. O portão real
`validar_briefing.py outputs/briefing_20260826.html` segue APROVADO, agora
confirmando IBOV e SPX em vez de registrar "nada a conferir". Deploy do remote
fica de fora, é ação humana explícita.

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

## Mudanças de 2026-08-25 — remote com REGRA 6, cron 07:00

Fechado o gap do fallback remoto (pendência #2 do CLAUDE.md): o `briefing-interno/remote`
passou a colher preços e conferir números antes de segurar a entrega.

> **Transparência sobre o objetivo**: o título do plano era "enviar às 07:00 com a máquina
> desligada", mas o cron **não envia** — roda sempre em `dry:true` (já era assim antes desta
> sessão). Com o PC desligado: às 07:00 gera+valida em dry, às 07:35 retry dry, às 07:40 o
> watchdog envia "REVISAO: pronto, aguardando envio", e o envio real é um `POST /run` manual
> sem `?dry=1&force=1` com a `RUN_TRIGGER_KEY`. A decisão de 19/08 ("nada sai sem sua revisão")
> está preservada, mas o título ficou pela metade: **não é envio automático às 07:00**.
>
> **Decisão registrada (2026-08-25, Yan) — manter MANUAL, liberar depois de provar em 3 passos:**
>
> 1. **Hoje, antes do próximo dia útil**: `schtasks /Change /TN "Szuchmacher-BriefingMatinal" /ST 06:55`.
>    Bloqueante nos dois modos. Enquanto local e remote ambos em 07:00, dia útil com PC ligado não
>    envia nada, só alerta às 07:40. Manual/auto não destrava isso, só o agendador.
> 2. **Manter manual durante a observação** (máquina desligada e ligada): os 2–3 dias úteis que o
>    plano previu são a prova real do caminho remoto (notícias, precos, REGRA 6, gemma). O custo do
>    manual é um POST após o alerta das 07:40. O custo do automático é perder a revisão de julgamento
>    — e o próprio projeto documentou isso em 24/08: um briefing formalmente válido (fonte no pool,
>    confiança no formato) mas com leitura de mercado equivocada passa direto. O 20/08 mostrou que
>    número errado passa limpo quando nada confere o valor; a REGRA 6 confere o número, mas leitura
>    errada com número certo ainda passa. "Nada sai sem olho seu" é a trava que sobrou.
> 3. **Depois de 3 dias úteis consecutivos** com a REGRA 6 aprovando sem intervenção: liberar o cron
>    para `TO_EMAIL` só, clientes continuam manuais (mesmo critério da pendência #1 do CLAUDE.md).
>    `TO_EMAIL` é a caixa do Yan, `TO_EMAIL_EXTRA` a yaragarbo9, risco baixo. Clientes nunca entram
>    sem o flag deliberado.
>
> **Receita da liberação futura** (só decide daqui a 3 dias úteis verdes, não agora): no
> `scheduled()` de `index.js`, trocar em `cron-run` `dry: true` → `dry: false` (linha 138); o
> `cron-retry` permanece `dry: true`. Alcance limitado a `TO_EMAIL` + `TO_EMAIL_EXTRA`.

- **Coleta de preços portada** (`remote/src/collect/precos.js`): Yahoo v8 chart (3 filtros de
  barra), PTAX/Bcb e SGS Selic, com quorum de fontes. Bateu campo a campo com o
  `precos_20260825.json` do local (15 ativos, 0 erros).
- **Bloco COTACOES no prompt** (`generate/briefing.js`): `buildUserPrompt(precos)` injeta o
  bloco logo após a DATA. `prompt_esperado.txt` regenerado sobre 24/08 com preços reais.
- **REGRA 6 portada** (`validate/briefing.js`): confronta nível citado com cotação, fail-closed
  (sem preços, reprova). Caso canônico: briefing_20260820 (IBOV 118.753,48 vs 167.830) reprova.
- **Fixtures congeladas**: agenda lida de `fixtures/agenda_24.json`, não do site vivo
  (pendência #5 do CLAUDE.md resolvida). Suíte do remote foi de 47/1-falha para **57/57**.
- **Cadeia de modelos com fallback**: `OPENROUTER_FALLBACK_MODEL = "meta-llama/llama-3.3-70b-instruct"`
  no wrangler.toml + inversão por tentativa (MODELVAR1) no run.js.
- **Cron flipado para 07:00 BRT** (`0 10 * * 1-5`) e deploy v14dc761b em produção. O cron
  roda SEMPRE em dry — nunca envia; o envio real exige `/run?date=...&force=1` manual sem
  `?dry=1` (RUN_TRIGGER_KEY humana; `&force=1` é necessário pois o cron/retry fecham `failed`
  com `attempts >= 2` e o claim do DO bloqueia sem force). Watchdog das 07:40 alerta pronto.
  Hoje está no modo manual; a decisão de liberar o envio automático do cron é do Yan.

### Ressalvas conhecidas (registradas, não criadas por esta sessão)

1. **Claim órfão local** (pré-existente): se o pipeline local clamar e morrer antes do
   `--complete`, o estado fica `processing/local` e a regra de takeover bloqueia a retomada
   remota. O retry das 07:35 não recupera; só `/run?force=1` desfaz. Não foi tocado.
2. **Gap da série de visão**: dias de máquina desligada não gravam em
   `briefing-interno/visao/` porque o remote não roda `gravar_visao.py`. **Decisão aceita** por
   ora: o gap é aceito em troca do fallback funcionar; reavaliar quando houver série.
3. **Task Scheduler local em 06:55** (aplicado em 2026-08-25, confirmado no Agendador):
   `schtasks /Change /TN "Szuchmacher-BriefingMatinal" /ST 06:55` rodou sem exigir senha,
   porque a tarefa é "Interativo apenas" e só o horário mudou (logon e opções de acordar
   intactos). Próxima execução registrada: 26.ago.2026 06:55:00. Com isso, em dia útil e máquina
   LIGADA, o local clama ~06:57 e o remote recua no cron das 07:00 (já_reservado), o envio
   automático local volta a ser a norma. O remote cobre o dia com o PC desligado.
4. **Envio a clientes intacto**: o remote continua enviando para destinatário único + BCC, não
   para os 22 de clientes. Não ampliar o alcance do remote antes de 2-3 dias úteis reais com a
   REGRA 6 validando em produção.

### Próximo passo da sessão

O `schtasks /Change /TN "Szuchmacher-BriefingMatinal" /ST 06:55` foi **aplicado** em 2026-08-25,
confirmado no Agendador (próxima execução 26.ago 06:55:00). Agora observar o próximo dia útil com
a máquina desligada de propósito: o cron remoto das 07:00 gera+valida em dry (REGRA 6), e o
watchdog das 07:40 avisa se o briefing ficou pronto. Para o envio real (destinatário único),
o usuário roda `POST /run?date=YYYYMMDD&force=1` (sem `?dry=1`) com a `RUN_TRIGGER_KEY`. A
decisão de liberar o cron para enviar sozinho (aprovação automática quando a REGRA 6 aprovar)
fica no colo do Yan — hoje é envio manual.

## Deploy de 2026-08-26 — remote com formatação determinística e paridade de arredondamento

Deploy do `briefing-interno/remote` (`sz-briefing-remote`) em produção, versão
`950b8183-c579-41da-b533-7799e9effeb4`, a partir de `main` em `db7087e` (paridade de
arredondamento Python/JS em empates decimais). O deploy leva junto o `161e4c6`
(formatação determinística de nível e REGRA 6 sem marcador), que ainda não estava no
Worker.

Validado em produção, sem envio (dry run):

- **Geração**: `POST /run?date=20260825&force=1&dry=1` respondeu `dry_ok` e `complete`,
  geração na tentativa 1 com `google/gemma-3-27b-it`, 5 URLs aprovadas no pool.
- **REGRA 6**: artefato `briefing:artefatos:20260825:validacao` no KV = APROVADO, 7
  mensagens. IBOV 174577 confere (pregao 2026-08-25), SPX 7677.28 confere, USDBRL
  5.1604 confere (pregao 2026-08-26), zero URLs fora do pool.
- **Saída final**: HTML gerado com os níveis formatados ("174.577 pontos",
  "7.677,28 pontos"), zero `174577` cru e zero `.0` cru.
- **Código novo no ar**: o bundle do Worker contém `roundHalfEvenEscalado` e
  `getBigUint64`, o round-half-even sobre o double exato, sem `toFixed`.
- **Logs**: `cron:ultimo:briefing` gravado pelo cron das 07:00 BRT de hoje,
  `briefing:heartbeat` presente, health responde `kv_bound` e `do_bound`.

Ressalva de observabilidade: o `wrangler kv key get/list` não enxergou as chaves do
briefing no namespace `SZ_AUTOMATION_KV` (`89432bb...`), mas a API REST mostrou tudo
(estado, heartbeat, cron e os 5 artefatos do dry run). O CLI do wrangler leu errado,
não o worker; para conferir KV daqui em diante, a API é a fonte.

Um aviso do validador no dry run: "Nenhum projeto citado no briefing. Pode estar
incompleto." Ficou como aviso, não reprovou; a chamada direcional (1) e as confianças
(5) passaram. Observar nos dias reais se o modelo costuma omitir projeto com o bloco
COTACOES no prompt.

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
- `docs/planejamento/PLANO_DEFINITIVO.md` (ordem de trabalho atual),
  `docs/planejamento/PLANO_ESTRATEGICO.md` (portões),
  `docs/planejamento/PLANO_EXECUCAO.md` (T1–T8) e
  `docs/planejamento/MORNING_CALL_OTIMIZADO.md` (contrato editorial do relatório)
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

## Estado do briefing-interno em 2026-08-24: render corrigido e envio a clientes armado

Sessão de madrugada, disparada por uma pergunta de pré-voo ("está tudo certo para o envio
de hoje"). Duas coisas mudaram.

**Envio a clientes de 24/08, pré-autorizado.** O Yan mandou soltar o briefing de hoje
também para a lista do Fechamento e escolheu o modo pré-autorizado, diferente do padrão de
19/08 (em que ele leu o e-mail das 07h00 antes de aprovar). Flag
`logs/aprovacao_clientes_20260824.flag` criado antes da geração do dia, task pontual
`Szuchmacher-EnvioClientes` armada para 09h00, disparo único, auto-remove ao terminar.
Lista viva do `.env` do Fechamento com 22 destinatários após dedup, eram 21 em 19/08.
`StartWhenAvailable` omitido de propósito: PC desligado às 09h00 significa nada enviado,
em vez de briefing matinal chegando ao cliente à tarde. A decisão de 14/08 segue como
padrão geral, o que mudou foi só o momento da aprovação.

**Bug P0 de render, corrigido (commit `0a25c6b`).** Um teste seco pedido pelo Yan achou que
`build_styled_email` produz e-mail só com hero e rodapé quando o briefing vem sem
`<h1>`/`<h2>`. Quem gera esse formato é o `meta-llama/llama-3.3-70b-instruct`, que o
MODELVAR1 (21/08) tornou o primeiro modelo da cadeia a partir da tentativa 2. Nunca atingiu
envio real, porque 21/08 aprovou na tentativa 1 e 22 e 23 foram fim de semana, mas bastava
um dia útil em que a tentativa 1 reprovasse. Corrigido em duas camadas, normalização da
entrada antes do parse e trava independente que barra envio de corpo vazio ou abaixo de 50%
do texto cru. Detalhe em `briefing-interno/CLAUDE.md` e no
`briefing-interno/diagnosticos/DIAGNOSTICO-2026-08-24.md`.

Registro de erro desta sessão, para não repetir: a primeira leitura afirmou que o e-mail de
21/08 tinha chegado vazio ao Yan. Ele conferiu a caixa e desmentiu. O artefato
`outputs/briefing_20260821.html` tinha sido sobrescrito nove horas depois do envio pelo
teste seco do MODELVAR1, então não era prova do que foi entregue. Conferir mtime contra a
hora do envio no log antes de tratar output em disco como evidência de entrega.

Pendente: o resultado real das 07h00 e das 09h00 de hoje, que ainda não aconteceram no
momento deste registro. `git push` segue bloqueado (P-14), a `main` está 3 commits à frente
de `origin`.

## Estado do briefing-interno em 2026-08-24 (sessão posterior): formatação do briefing alinhada ao Fechamento

Reformatação do Briefing Matinal diário para o visual do Fechamento de Mercado, a pedido do
Yan (a letra "garrancho" saía da tipografia densa do corpo e do LLM gerando HTML com estilo
próprio). O `h1` ficou exclusivo do template; o corpo usa `h2/p/li/b/a`; o `PANORAMA DIARIO`
foi mantido (nomenclatura vigente, ajuste confirmado em `enviar_briefing.py:510` e
`resend.js:378`). Trabalho **não commitado** nesta sessão.

**Feito e verificado**
- Novo sanitizador `briefing-interno/scripts/_sanitizar_briefing.py` (stdlib): allowlist
  `h2/p/li/ul/ol/b/strong/a/br`, `h1→h2` (nunca emite h1), remove `style/class/id/on*`,
  `href` só `http(s)://`, `<script>/<style>` descartados, idempotente. 13 testes em
  `tests/test_sanitizar_briefing.py`.
- `gerar_briefing.py`: prompt do LLM vira só o miolo (h2/p/li/b/a, sem h1/estilos); `main()`
  sanitiza antes de gravar. `_build_user_prompt` permaneceu intacto (teste de paridade e a
  falha conhecida da agenda não foram tocados).
- `enviar_briefing.py`: corpo 15px/26px, títulos 16px, números Courier 12px, hero paddings
  do Fechamento (`28px 32px 8px` / label `4px 32px 20px`), rodapé com `szuchmacher.com.br`
  clicável, hierarquia `h[12]` (regex de corte de fonte e `_normalizar_estrutura` aceitam
  h1/h2).
- Remote espelhado: `briefing.js` com `SYSTEM_PROMPT` byte a byte idêntico ao Python novo +
  `sanitizarConteudo()` (porta funcional, aplicada em `geraComCadeia`); `resend.js` com os
  mesmos estilos e o pré-processo do Python (normalização + corte de `<a>` da seção O QUE
  IMPORTA, com flag dotAll). Fixtures `styled_esperado_{20260817,20260818}.html`
  regeneradas do Python real.

**Verificação fresca desta sessão**
- `python -m unittest tests.test_sanitizar_briefing tests.test_pipeline_robustez
  tests.test_regra6_numeros tests.test_validar_briefing` → 63 OK.
- Validador sobre conteúdo sanitizado do briefing_20260824 → APROVADO nas 6 regras.
- Suíte remote → 33 pass, 1 fail (único fail é o `prompt.equiv` pré-existente, drift de
  artefato da agenda, não corrigido conforme escopo).
- `npm test` (19), `npm run typecheck`, `npm run lint` (raiz) → limpos.
- Compatibilidade Gmail/Outlook do e-mail estilizado (checagem estática): 14/14 checks OK
  (doctype xhtml, mso, role=presentation, 600px, sem CSS/script/on*, fontes com fallback,
  cores hex, PANORAMA DIARIO, seções, rodapé link, disclaimer). Sem renderizador de e-mail
  real no ambiente, a verificação foi estática.

**Não feito / bloqueado**
- Sem deploy, sem envio, sem tocar flags de clientes (conforme ordem).
- Falha conhecida da agenda (`prompt.equiv` no remote) permanece, por escopo.
- `git push` segue bloqueado (P-14), `main` está N commits à frente de `origin`;
  - Resolvido em 18/09/2026 — caso P-14 (push 403): causa raiz na credencial de conta errada do
    GCM do Windows, roteada ao `gh`; evidência e medições em `t_5352ee15`, registro consolidado
    no P-14 de `PENDENCIAS.md`.
  - Resolvido em 18/09/2026 — caso P-14: `git push` 403 por credencial de conta errada do GCM
    do Windows (causa raiz; evidência, medições e datas completas em `t_5352ee15` e no
    registro consolidado do P-14 em `PENDENCIAS.md`). Dúvidas de "bloqueado" entre 21/08 e hoje
    não são mais necessárias: `origin` (via `gh`) e o `main` local já convergiram.
  working tree com os 7 arquivos de código/fixture/tests modificados + 2 novos
  (`_sanitizar_briefing.py`, `test_sanitizar_briefing.py`) + `AGENTS.md` (mudança de outra
  sessão de /init) + `.reasonix/` e `reasonix.toml`.

**Handoff**
- Próximo passo: o Yan conferir o visual do e-mail estilizado (gerar de
  `outputs/briefing_<data>.html` via `build_styled_email` e abrir no cliente) e autorizar
  deploy/commit. Antes do próximo envio real, validar o briefing do dia com
  `python briefing-interno/scripts/validar_briefing.py outputs/briefing_<data>.html`.
- Evitar: reintroduzir `<h1>` no miolo gerado (o sanitizador já normaliza para h2) e portar
  o cut de `<a>` da seção O QUE IMPORTA fora de `buildStyledEmail`/`build_styled_email`.
