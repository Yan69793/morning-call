---
name: encerrar-sessao
description: >
  Encerramento formal de sessão no Morning Call + Radar Quant: inventário do que
  mudou, verificação fresca com os portões deste repo (npm do monorepo, unittest
  do briefing-interno, validador do briefing), estado do working tree, Task
  Scheduler e envio a clientes, riscos, handoff e gravação em status/ESTADO.md,
  PENDENCIAS.md e CLAUDE.md. Especializa a skill global encerrar-sessao com os
  caminhos e comandos reais deste projeto. Use ao pedir encerrar, fechar sessão,
  fechar tarefa, wrap-up, closeout, "o que foi feito", "pode encerrar", ou rodar
  /encerrar-sessao neste diretório. Também ao fim de trabalho relevante aqui.
---

# Encerrar sessão — Morning Call + Radar Quant

Esta skill é **delta** da global (`C:\Users\User\.claude\skills\encerrar-sessao`),
não substituta. Ler a global para tom do chat, lei de ferro, ordem do protocolo,
anti-padrões e a linha final obrigatória. Aqui ficam só as partes que mudam
quando a sessão foi neste repo, porque a global aponta para uma estrutura de
vault (`AI_OPERATING_SYSTEM/11_MEMORIA_DE_SESSAO.md`, `05_BACKLOG_E_PRIORIDADES.md`,
`TASKS.md`) que não existe neste projeto.

Regra de ouro herdada e reforçada: o `CLAUDE.md` daqui proíbe duplicar fila de
pendência em terceira cópia. Vale para este arquivo também. Se uma regra da
global mudar, não copiar para cá, só apontar.

## Ponteiros deste projeto (ler no início do closeout)

| Papel | Arquivo |
|---|---|
| Estado canônico, lido por qualquer agente | `status/ESTADO.md` (mais recente no topo) |
| Fila curada por urgência | seção "Pendências abertas" do `CLAUDE.md` raiz |
| Fila detalhada de auditoria (IDs MC-, RQ-, DEPLOY-, W-, T-) | `PENDENCIAS.md` |
| Log de decisão do pipeline do briefing | `briefing-interno/CLAUDE.md` (seções datadas) |
| Diagnóstico formal, quando houver auditoria | `briefing-interno/diagnosticos/DIAGNOSTICO-AAAA-MM-DD.md` |
| Memória entre sessões (usuário, feedback, projeto, referência) | `C:\Users\User\.claude\projects\E--Diretorio-Claude-FREQUENTE-Morning-Call\memory\` + `MEMORY.md` |

## Verificação: comandos reais deste repo

Nunca declarar verde sem colar saída real. O `CLAUDE.md` raiz exige isso
explicitamente.

| Claim | Comando | Nota |
|---|---|---|
| Monorepo verde | `npm test && npm run typecheck && npm run lint` na raiz | portão oficial, hoje 317 testes (81 analytics, 217 morning-call, 19 radar-quant) |
| Pipeline do briefing verde | `python -m unittest discover -s tests` dentro de `briefing-interno/` | hoje 70 testes, não entra no `npm test` |
| Worker de reserva | `npm test` dentro de `briefing-interno/remote/` | suíte própria, não entra no portão da raiz. Um caso falha por drift de fixture da agenda, defeito conhecido, não confundir com quebra nova |
| Conteúdo do briefing do dia | `python briefing-interno/scripts/validar_briefing.py briefing-interno/outputs/briefing_AAAAMMDD.html` | portão de conteúdo, reprova bloqueia envio |
| Sintaxe de `.ps1` alterado | `[System.Management.Automation.Language.Parser]::ParseFile(<path>, [ref]$t, [ref]$e)` | script do Task Scheduler quebrado só aparece no dia seguinte, às 07h |
| Tarefas agendadas | `Get-ScheduledTask -TaskName 'Szuchmacher-*'` | conferir estado (Ready/Disabled) do que a sessão alegou mexer |
| O que realmente foi enviado | flags em `briefing-interno/logs/` (`sent_`, `sent_clientes_`, `aprovacao_clientes_`) + linha `ENVIAR_BRIEFING` no log do dia | ver armadilha abaixo |

**Armadilha registrada (24/08).** Artefato em `outputs/` não é prova do que o
destinatário recebeu, o pipeline reescreve o mesmo caminho. Conferir mtime
contra a hora do envio no log antes de tratar HTML em disco como evidência.

**Armadilha registrada (02/09).** Mensagem de bloqueio de permissão do harness
(`git push` recusado pelo classificador) não prova que a ação não aconteceu.
Conferir o estado real (`git fetch` + `git rev-parse origin/<branch>`) antes de
reportar bloqueio no closeout.

## Perguntas obrigatórias de risco (este projeto manda e-mail real)

Responder as cinco, mesmo que seja "não tocou":

1. Mudou **quem** recebe e-mail? (`.env` do Fechamento em
   `E:\Diretorio\Claude\FREQUENTE\relatorio-diario-szuchmacher`, chaves
   `RECIPIENT` e `BCC`, lista viva usada pelo Fechamento e pelo modo
   `--clientes` do briefing). Endereço de cliente é dado pessoal, LGPD, nunca
   em log, nunca versionado, nunca colado em chat sem necessidade.
2. Mudou **o que** o cliente recebe? (prompt, validador, `build_styled_email`,
   REGRA 6). Mudança em render ou parser exige reprocessar briefings reais em
   disco e comparar texto visível, o portão não cobre essa etapa.
3. Mudou o **alcance do remote**? `briefing-interno/remote/` não tem a REGRA 6
   portada. Ligar cliente no caminho remoto sem portar reabre o buraco de 20/08.
4. Houve **deploy**? Deploy de Worker é ação humana explícita por regra da casa.
   Se a sessão não deployou, dizer isso, não deixar implícito.
5. Tocou em **secret**? Chave em `.env` nunca vai para commit, log, argumento de
   linha de comando ou URL.

## Persistência: onde gravar o quê

1. **`status/ESTADO.md`** sempre que o estado mudou. Bloco novo no topo, título
   com data e tema, e atualizar a linha "Última atualização". É o arquivo que o
   próximo agente lê primeiro.
2. **`CLAUDE.md` raiz**, seção "Pendências abertas", quando um item da fila
   curada nasceu, mudou de forma ou morreu. Manter a ordenação por urgência.
3. **`PENDENCIAS.md`** quando um achado com ID mudou de status, ou como nota
   datada no fim quando a mudança é operacional e não cabe nas tabelas. Não
   reescrever entrada histórica, o arquivo é log cronológico, corrigir se
   necessário com nota nova apontando para a antiga.
4. **`briefing-interno/CLAUDE.md`** quando a decisão foi sobre o pipeline do
   briefing. Seção datada nova. Decisão que revoga decisão anterior precisa de
   pointer explícito na seção antiga, senão quem lê só aquele trecho age com
   regra morta.
5. **memória do projeto** (`memory/` + `MEMORY.md`) só para fato que serve em
   sessão futura: preferência do operador, feedback que não deve ser repetido,
   armadilha não óbvia. Não gravar estado de código lá, ele é derivável do repo.

Sessão só de leitura não grava nada, e o chat diz isso e o porquê.

## Modelo

Inventário curto sem mudança material: modelo barato.
Sessão que mexeu em envio a cliente, Task Scheduler, Worker, secret, ou que
deixou working tree sujo: modelo forte. Primeira frase do chat diz qual e por quê.

## Exemplo de tom para o chat (ilustrativo, não copiar cego)

```
Sonnet 5, sessão mexeu em envio a cliente e Task Scheduler, não é inventário trivial.

A sessão automatizou o envio do Morning Call à lista do Fechamento. O PASSO 5.8
novo em briefing-interno/scripts/run_briefing.ps1 cria o flag de aprovação
sozinho quando a REGRA 6 aprova na tentativa 1 de 3 e chama enviar_briefing.py
--clientes na sequência, com trava para não mandar nada depois das 09h em
execução atrasada. Commit be50beb, oito arquivos, já em origin/main.

Rodei o portão da raiz, 317 testes com typecheck e lint limpos, e a suíte do
briefing-interno, 70 testes, as duas verdes depois das edições de documentação.
O envio de hoje saiu de verdade, 28 destinatários, Resend 9f2e4c6d, sentinela
sent_clientes_20260902.flag em disco.

Não fechei a Resolução CVM 20 nem portei a REGRA 6 para o remote, os dois
seguem como item 3 e item 2 das pendências abertas. Não houve deploy de Worker.

Próximo passo útil: conferir amanhã depois das 07h se o PASSO 5.8 disparou
sozinho, olhando CLIENTES OK no log do dia. Evitar ligar o remote na lista de
cliente antes de portar a REGRA 6.

Gravado em status/ESTADO.md, CLAUDE.md raiz, PENDENCIAS.md e
briefing-interno/CLAUDE.md.

SESSÃO ENCERRADA. 2026-09-02
```
