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

## Staleness do Radar Quant

O `coletar_estado.py` detecta `marketDate` anterior ao ultimo pregao. Com 2 dias uteis consecutivos de atraso, o briefing suprime a secao do Radar Quant e informa que o scan esta fora do ar. O contador zera na primeira entrega com dado fresco. Enquanto o scan esta fora do ar, o `coletar_estado.py` tenta Yahoo Finance como fallback para dados basicos de OHLCV.

## Feriados B3

`feriados-b3.json` contem os feriados em que a B3 nao opera, com campo `cobertura_ate`. Se a data corrente passar de `cobertura_ate`, o sistema alerta e trata como dia util (melhor rodar em feriado do que nao rodar em dia util). Atualizar o arquivo anualmente, antes de novembro do ultimo ano coberto.

## Manutencao do mapa de exposicao

Toda vez que um projeto novo ganha `CLAUDE.md` proprio no workspace, atualizar `projetos-exposicao.json` junto. Projeto novo sem entrada no mapa sera reprovado pelo validador se citado no briefing, e projeto com `exposicao` vazia tambem.

## Comando de aceite

```powershell
python scripts/validar_briefing.py outputs/briefing_YYYYMMDD.html
```
