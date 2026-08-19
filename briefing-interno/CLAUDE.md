# CLAUDE.md — Briefing Interno

Parte do monorepo `Morning Call` (`E:\Diretorio\Claude\Morning Call\briefing-interno\`). Pipeline Python que monta e envia, todo dia util as 07h00, um briefing matinal para o Yan: o que tende a subir, o que tende a descer, por que, e o que isso significa para cada projeto do portfolio.

Consome a API do Morning Call Worker (`morning-call.prospects-intel.workers.dev`) como uma das fontes de estado. O Worker e os apps TypeScript estao em `../apps/` e `../packages/` — este diretorio e Python puro, nao faz parte do workspace npm.

## Principio central

Material interno, para o Yan. Nao sai com a assinatura da casa. Isso permite fazer chamada direcional com grau de confianca declarado, coisa que o Fechamento Diario nao pode fazer.

Briefing ausente e problema pequeno, o Yan e avisado e resolve. Briefing errado e problema grande, e nao tem como voltar atras depois de enviado. Se o material do dia nao puder ser produzido dentro do padrao, nao manda nada e avisa o Yan.

## Stack

Python 3.11, biblioteca padrao apenas (zero dependencia pip). Mesmo principio do `relatorio-diario-szuchmacher`: robustez para rotina que precisa rodar sozinha por anos numa maquina Windows.

PowerShell 7 (pwsh.exe) para chamada do Task Scheduler. Scripts .ps1 em ASCII puro, sem BOM no launcher, com BOM no script principal.

## Fluxo

```
Task Scheduler (07h00, dias uteis)
  -> launcher_briefing.ps1        (isola erro de parse, sempre grava uma linha de log)
     -> run_briefing.ps1          (orquestra, decide dia util, idempotencia)
        -> coletar_noticias.py    (RSS BR + Finnhub global)
        -> coletar_estado.py      (GET nos 3 workers + mapa de exposicao)
        -> gerar_briefing.py      (OpenRouter, primario + reserva)
        -> validar_briefing.py    (PORTAO, reprova aborta o envio)
        -> enviar_briefing.py     (Resend)
```

## Fallback remoto (sz-briefing-remote)

Desde 19/08/2026 existe um Worker Cloudflare em `remote/` que cobre o cenario de
PC desligado ou falha do Task Scheduler as 07h00. Cron proprio (07:05 retry
07:35, watchdog 07:40 BRT), Durable Object para claim atomico com o local
(nunca duas entregas no mesmo dia), KV como espelho consultavel via
`GET https://sz-briefing-remote.prospects-intel.workers.dev/health`.

Ele nunca envia e-mail sozinho: gera, valida, segura e avisa o Yan por e-mail
(RESEND_API_KEY, ALERT_EMAIL ja configurados), que aprova o envio manual via
`POST /run?date=YYYYMMDD` autenticado (sem `dry`). Bate com a proibicao de
reenvio automatico dada em 18/08. Detalhe da sessao que deployou e da trava
em `status/ESTADO.md`, secao "Estado do briefing-interno em 2026-08-19".

Local continua sendo o caminho principal e o unico com `--clientes`; o remote
so entra se o local nao reivindicar o dia (`scripts/claim_remote.py`, best
effort, nunca bloqueia o local se o Worker estiver fora do ar).

## Portao de verificacao

Antes de declarar qualquer tarefa concluida, execute:

```powershell
python scripts/validar_briefing.py outputs/briefing_YYYYMMDD.html
```

Substituir `YYYYMMDD` pela data do briefing. Se reprovar, nao enviar. Cole a saida real na resposta. Se falhar ou nao puder executar, diga explicitamente. Nunca declare "funcionando" sem a saida colada.

## O que nunca fazer aqui

- Nunca enviar briefing sem o validador aprovar (F03 nao se repete aqui)
- Nunca deixar o modelo inventar relacao de projeto que nao esta em `projetos-exposicao.json`
- Nunca atribuir causa de mercado sem `fonte_url` no pool de noticias do dia
- Nunca citar projeto com `exposicao` vazia
- Nunca mandar briefing sem chamada direcional (briefing vazio e falha)

## Staleness do Radar Quant (SUSPENSO em 13/08/2026)

O `coletar_estado.py` detecta `marketDate` anterior ao ultimo pregao. Com 2 dias uteis consecutivos de atraso, o briefing suprime a secao do Radar Quant e informa que o scan esta fora do ar. O contador zera na primeira entrega com dado fresco. Enquanto o scan esta fora do ar, o `coletar_estado.py` tenta Yahoo Finance como fallback para dados basicos de OHLCV.

Em 13/08/2026 o Yan tirou a secao RADAR QUANT (e a MORNING CALL) do briefing. A REGRA 4 do validador ficou neutralizada (retorna sempre OK, com o codigo antigo preservado em comentario) e o envio descarta as duas secoes se o modelo as escrever mesmo assim. Se a secao voltar, reativar `_check_radar_quant_staleness` em `validar_briefing.py` e devolver as secoes ao prompt de `gerar_briefing.py`.

## Feriados B3

`feriados-b3.json` contem os feriados em que a B3 nao opera, com campo `cobertura_ate`. Se a data corrente passar de `cobertura_ate`, o sistema alerta e trata como dia util (melhor rodar em feriado do que nao rodar em dia util). Atualizar o arquivo anualmente, antes de novembro do ultimo ano coberto.

## Manutencao do mapa de exposicao

Toda vez que um projeto novo ganha `CLAUDE.md` proprio no workspace, atualizar `projetos-exposicao.json` junto. Projeto novo sem entrada no mapa sera reprovado pelo validador se citado no briefing, e projeto com `exposicao` vazia tambem.

## Comando de aceite

```powershell
python scripts/validar_briefing.py outputs/briefing_YYYYMMDD.html
```

## O que aconteceu em 13 de agosto de 2026, para nao repetir

O briefing das 07h00 nao saiu pelo terceiro dia seguido, e desta vez a cadeia completa de defeitos apareceu:

1. **Alias da Store quebrado (PWSHALIAS1).** O pacote MSIX do PowerShell 7 foi atualizado pela Store e o App Execution Alias em `%LOCALAPPDATA%\Microsoft\WindowsApps\pwsh.exe` virou arquivo de 0 byte sem reparse point. O `Resolve-PwshExe` do launcher rejeitou o alias corretamente e nao havia nenhum outro candidato. Mesmo padrao que ja tinha quebrado o fechamento em 27/07. A resolucao interativa funciona porque o pwsh 7 adiciona o proprio diretorio ao PATH do processo, o que mascara o problema em teste manual.

2. **Caminho com espaco quebrando Start-Process.** `Morning Call` tem espaco no nome. O `Start-Process -ArgumentList` junta o array com espacos sem aspas, entao `-File E:\...\Morning Call\...` virava dois argumentos. O defeito existia no launcher (chamada do run_briefing.ps1) e no `Run-Python` (todos os passos do Python). Estava mascarado porque a tarefa morria antes, no erro do pwsh. Em 10/08 e 11/08 a morte era no alias, em 12/08 e 13/08 no PWSHALIAS1, e o pipeline so chegou a esse defeito na recuperacao manual do dia 13.

3. **Parametro `$args` engolindo argumento.** O `Run-Python` declarava um parametro chamado `$args`, que e variavel automatica do PowerShell. O caminho do HTML nunca chegava ao validador, que imprimia usage e reprovava o envio. Renomeado para `$extraArgs`.

Os tres foram corrigidos em 13/08. O portao ainda reprovou uma URL inventada pelo modelo (REGRA 1, o link do Congresso fora do pool de noticias), que foi removida mantendo o texto do item. O envio do dia saiu as 08h32 apos aprovacao do validador.

### Camadas de correcao do pwsh, na ordem

- Imediato (13/08): diretorio versionado do MSIX adicionado ao PATH do usuario. Vale ate o proximo update da Store.
- Definitivo (pendente): instalar PowerShell 7 MSI em `C:\Program Files\PowerShell\7`, candidato estavel do launcher, independente de alias. Exige elevar o `uac-fix-20260813.ps1` em `E:\Diretorio\Claude\FREQUENTE\relatorio-diario-szuchmacher\diagnosticos\`.

### Regras que saem daqui

- Toda chamada de processo com caminho de projeto precisa de aspas duplas explicitas no argumento, o caminho do projeto tem espaco. Nao confiar na juncao de array do `Start-Process -ArgumentList`.
- Nenhum parametro de funcao pode se chamar `$args`.
- O teste manual da resolucao do pwsh precisa rodar num powershell.exe 5.1 com PATH recem-lido, nao na sessao interativa do pwsh 7, que esconde a quebra do alias.

## Visual do e-mail (13/08/2026)

O e-mail do briefing saiu do HTML cru e passou a usar a paleta e a formatacao do relatorio diario (hero navy `#0a1428`, dourado `#92703a`, tabelas com inline CSS seguro para Outlook, mesmo padrao do `send_briefing_email.py` do Fechamento). O modelo continua gerando conteudo sem estilo, e o `enviar_briefing.py` aplica o visual na hora do envio via `build_styled_email`. O arquivo em disco continua sem estilo de proposito, porque o `validar_briefing.py` trabalha sobre o conteudo puro. Mudar o visual e mexer so no `enviar_briefing.py`, nunca pedir CSS para o modelo.

Duas decisoes do Yan no mesmo dia, tambem so visuais: a citacao de fonte (colchetes com URL) e o parentese de confianca sao REMOVIDOS do e-mail pelo `_strip_fonte_e_confianca`. O arquivo em disco mantem os dois, porque o validador depende deles (REGRA 1 e REGRA 2). Colchete que nao parece URL fica, como a anotacao do fallback do Yahoo Finance. Se um dia o validador deixar de exigir confianca ou fonte, revisar esta remocao antes de mexer.

## Decisoes de produto de 13/08/2026

- Secoes 5 (RADAR QUANT) e 6 (MORNING CALL) retiradas do briefing. O prompt nao pede mais as duas, a agenda virou a secao 5.
- Morning Call e Radar Quant tambem sairam da LEITURA POR PROJETO: o prompt proibe cita-los como projetos, e qualquer mencao que o modelo fizer e limpa na revisao do dia.
- O e-mail leva o logo e o nome da Szuchmacher Consultoria no hero, com "PANORAMA DIARIO" como etiqueta e a linha "O essencial dos mercados para começar o dia". A etiqueta antiga "MATERIAL INTERNO" e a linha "O que tende a subir, o que tende a descer e o impacto por projeto" sairam em 13/08, quando o produto passou a mirar clientes. O logo e referenciado pela URL publica `https://szuchmacher.com.br/logo.png`, sem upload no envio.
- Formato do briefing mudou para o padrao dos bancos globais (pesquisado pelo Yan em 13/08: Deutsche Bank Early Morning Reid, Bloomberg Five Things, Goldman Briefings): Resumo em 2-3 frases, secao "O que importa hoje" com 3 a 5 pontos numerados, cada ponto com titulo em negrito, numeros exatos com comparacao historica e a ultima frase dizendo por que importa. Agenda no fim. Detalhes e fontes da pesquisa em `docs/plano-versao-cliente.md`.
- A agenda do dia agora vem pronta no prompt, lida de `Site\site-producao\agenda-data.json` (funcao `_bloco_agenda`), mantida pelo Szuchmacher-AgendaAgent das 08h00. O modelo nao pode mais inventar evento de agenda: sem evento confirmado na fonte, escreve "Sem eventos de agenda confirmados para hoje". Em 13/08 ele tinha inventado CPI, discurso do Fed e reuniao do BRICS.
- O modelo costuma trocar pedacos de URL (dominio ou data). O validador compara host e caminho normalizados contra o pool e reprova. Corrigir a citacao no arquivo quando acontecer, nao afrouxar a regra.

## Teste de um dia: envio a clientes em 14/08/2026

Decisao do Yan em 13/08: so no dia 14/08, o briefing sai tambem para a lista de clientes do Fechamento, as 10h00, e somente depois de o Yan validar o material das 07h00. Fluxo:

1. 07h00: briefing sai para o Yan normalmente (a task das 07h agora tem WakeToRun, ver pendencia abaixo)
2. Yan valida o e-mail e aprova no chat; o Claude cria `logs/aprovacao_clientes_20260814.flag`
3. 10h00: a task unica `Szuchmacher-EnvioClientes` roda `run_envio_clientes.ps1`, que envia o MESMO HTML via `enviar_briefing.py --clientes` (BCC real com a lista do `.env` do Fechamento) e se auto-remove
4. Sem o flag: nada sai, fica `CLIENTES: SEM APROVACAO` no log, e a task se auto-remove do mesmo jeito

O modo `--clientes` exige o flag de aprovacao (falha fechada, testado em 13/08), le o `.env` do Fechamento para FROM_EMAIL, RECIPIENT e BCC, e usa sentinela propria `sent_clientes_<data>.flag`. Nunca imprimir os enderecos em log ou saida.

PENDENCIA de 13/08, RESOLVIDA no mesmo dia as 12h55: o WakeToRun da `Szuchmacher-BriefingMatinal` foi aplicado e conferido direto no Agendador (`WakeToRun=True`, `StartWhenAvailable=True`, evento 140 do TaskScheduler/Operational). As duas tentativas de UAC falharam de manha, a terceira passou. Nada pendente aqui.

## Decisao de 14/08/2026: envio a clientes cancelado, briefing sai sempre e apenas para o Yan

O teste de um dia nao chegou a acontecer: o briefing das 07h00 de 14/08 reprovou no portao (REGRA 5, drift prompt x validador, corrigido no mesmo dia) e a task `Szuchmacher-EnvioClientes` das 10h00 saiu com `SEM APROVACAO` e se auto-removeu, como projetado. O fail-closed funcionou.

Na mesma tarde o Yan decidiu: **o briefing nao vai mais para clientes, sempre e apenas para ele**. O teste de um dia fica cancelado de forma permanente. O que isso significa em codigo:

- O modo `--clientes` do `enviar_briefing.py` e o `run_envio_clientes.ps1` seguem no repo sem uso (remover ou manter como codigo morto documentado e uma pergunta aberta no PENDENCIAS.md, pergunta P-04).
- Nenhuma task do Task Scheduler envia para clientes (a `Szuchmacher-EnvioClientes` era unica e se auto-removeu em 14/08).
- O visual "PANORAMA DIARIO" com logo Szuchmacher fica como esta, agora direcionado ao Yan.

## Excecao de 19/08/2026: envio pontual a lista do Fechamento, decisao de 14/08 segue como padrao

O Yan mandou explicitamente soltar o briefing de 19/08 para a lista de clientes do relatorio diario: 21 enderecos do `.env` do Fechamento, BCC real, sem duplicacao (o dedup interno do modo `--clientes` cuida disso). Executado as 08:59:57 BRT via `enviar_briefing.py --clientes`, com flag `logs/aprovacao_clientes_20260819.flag`, sentinela `sent_clientes_20260819.flag`, Resend ID `eafcb6d1-a033-4971-b2e2-73580cd836d8`, validador rodado dentro do proprio script antes do envio (prevencao F03). A lista do Fechamento ja continha os dois enderecos do envio interno (szuchmacheryan, yaragarbo9), entao os dois receberam segunda copia no dia; nenhum outro destinatario recebeu duplicata.

A decisao de 14/08 segue como padrao: envio a clientes continua exigindo ordem direta do Yan, flag de aprovacao do dia e a lista viva do `.env` do Fechamento. Nada mudou no fluxo das 07h00.

## Envio avulso para outro destinatario

`enviar_briefing.py` aceita `--to email@x.com` para mandar uma copia para outro endereco sem mexer no `.env`. A validacao e a sentinela de idempotencia continuam valendo. Pedido do Yan em 13/08 para revisar o material em outra caixa.

## Destinatario extra permanente no envio diario

`TO_EMAIL_EXTRA` no `.env` (lista separada por virgula) recebe o briefing todo dia, junto com `TO_EMAIL`, sempre em BCC (nunca em `to`, para nao expor o endereco de ninguem). So se aplica ao envio padrao automatico das 07h00: uma chamada com `--to` (desvio pontual, ex.: Yan revisando noutra caixa) NAO puxa a lista extra, so manda para o endereco passado na hora. Adicionado em 17/08/2026 com `yaragarbo9@gmail.com`, a pedido do Yan. `_parse_extra_recipients` (testado em `TestExtraRecipients`, T07) descarta entrada vazia, entao virgula sobrando no fim da lista nao quebra o envio com endereco vazio.

## Bug de renderizacao do e-mail, corrigido em 17/08/2026

O briefing das 07h00 de 17/08 reprovou na 1a rodada (REGRA 2, formato de confianca, corrigido no mesmo commit que apertou a instrucao no prompt) e foi reenviado com sucesso as 07:54 e 08:06, mas as duas vezes o e-mail saiu com defeito: fonte cortada ("conforme reportado pela .") e o titulo de cada ponto duplicado como um item numerado fantasma, so com o titulo, sem corpo. O arquivo em disco (`outputs/briefing_20260817.html`) sempre esteve correto, o validador nunca pega esse tipo de erro porque ele roda sobre o HTML cru, nao sobre o e-mail estilizado que `build_styled_email` monta na hora do envio.

Causa raiz, os dois no mesmo metodo `_BriefingContent.handle_data`:

1. Todo texto dentro de `<a>...</a>` era descartado incondicionalmente, para sumir com citacao em `[url]`. O modelo (`google/gemma-3-27b-it:online`) citou a fonte como link natural na frase (`conforme reportado pela <a href=...>InfoMoney</a>`), entao o nome da fonte, que e parte da frase e nao so citacao, sumia junto.
2. O roteamento olhava so `self._stack[-1]` (topo imediato da pilha). Quando `<b>` abre dentro de `<li>`, o topo vira `"b"`, e o texto caia no ramo de texto solto (bare) escrito para o caso do modelo nao usar `<li>` nenhum. O titulo sumia do item real e reaparecia depois como item novo, so com o titulo.

Corrigido: `<a>` agora e transparente (o href nao sobrevive, o texto visivel sim, quem segue removendo citacao em `[url]` e a confianca e o `_strip_fonte_e_confianca`, inalterado) e o roteamento passa a checar se ha `<li>`/`<p>` aberto (`self._li_segments`/`self._p_segments` nao-None), nao o topo da pilha. Regressao coberta em `tests/test_pipeline_robustez.py::TestBriefingContentParser` (T06). Verificado localmente contra o HTML real de 17/08, sem reenviar nada: os dois itens saem com titulo, corpo e fonte intactos.

Diagnostico completo em `diagnosticos/DIAGNOSTICO-2026-08-17.md`. Decisao do Yan no mesmo dia: manter a arquitetura de conteudo embutido no e-mail (nao migrar para o modelo do Fechamento de Mercado, e-mail curto com link para pagina hospedada), so corrigir o parser.
