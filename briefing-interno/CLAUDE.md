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

PENDENCIA de 13/08: o WakeToRun da `Szuchmacher-BriefingMatinal` nao foi aplicado, as duas tentativas de UAC nao foram aceitas. Rodar elevado `scripts/wakeup-briefing-ADMIN.ps1` e conferir `WakeToRun=True`. Sem isso, maquina suspensa as 07h00 continua atrasando o briefing.

## Envio avulso para outro destinatario

`enviar_briefing.py` aceita `--to email@x.com` para mandar uma copia para outro endereco sem mexer no `.env`. A validacao e a sentinela de idempotencia continuam valendo. Pedido do Yan em 13/08 para revisar o material em outra caixa.
