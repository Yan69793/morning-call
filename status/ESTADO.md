# Estado do projeto — Morning Call

Última atualização: 2026-08-26 (agente: Claude Code)

Leia este arquivo antes de começar qualquer trabalho, seja qual for o agente.
Atualize a data e os itens abertos ao fechar uma sessão que mudou o estado.
Não duplique conteúdo do CLAUDE.md nem do README.md: aqui fica só o ponto de
partida com os ponteiros.

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
