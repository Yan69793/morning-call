# CLAUDE.md — Morning Call + Radar Quant (hardened 2026-07-25)

## Estado do projeto

Página canônica de estado, legível por qualquer agente (não só Claude): `status/ESTADO.md`. Ler antes de começar sessão de trabalho, atualizar a data e os itens ao fechar uma sessão que mudou o estado.

Monorepo npm workspaces: `apps/morning-call/`, `radar-quant-brasil/`, `packages/analytics/`.
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

## Pendências abertas

Seção criada em 2026-08-24. Existe porque `scan-pendencias.ps1`, da skill
`resolver-pendencias`, casa exatamente este cabeçalho. Sem ele o Morning Call saía
invisível no raio-x do workspace mesmo com 80 achados registrados. Mesmo motivo pelo
qual o VIX Radar criou a dele em 19/08.

A fila detalhada é `PENDENCIAS.md`, na raiz deste projeto. Não duplicar aqui, uma
terceira cópia só criaria mais uma versão para divergir.

Status reconciliado em 24/08, os 80 achados conferidos um por um contra o código. Zero
linhas em `NOVO`. Resultado, 31 resolvidos, 47 abertos e 2 em `REVISAR`. Detalhe na
seção "Reconciliação de status" do `PENDENCIAS.md`.

Ordenado por urgência, não por severidade técnica.

1. **Envio a clientes automatizado desde 02/09.** O critério de religamento do item
   anterior (três briefings em dias úteis consecutivos passando a REGRA 6 sem
   intervenção manual) foi cumprido em 28/08, 31/08 e 01/09. A pedido do Yan,
   `run_briefing.ps1` (PASSO 5.8) passou a criar o flag `logs/aprovacao_clientes_<data>.flag`
   sozinho, todo dia útil, sempre que a REGRA 6 aprovar o briefing de primeira (tentativa 1
   de 3, sem reprovação nem correção), e a disparar `enviar_briefing.py --clientes` na
   sequência, para a lista de 28 endereços do `.env` do Fechamento. O antigo portão de
   aprovação manual em chat (ato deliberado, nunca rotina) foi substituído por essa
   checagem automática, não existe mais aprovação humana diária no caminho.

   Dois riscos residuais ficam mais relevantes agora que o envio é rotina, não teste
   pontual. A REGRA 6 tem ponto cego documentado (câmbio, juro, commodity, vol e ação sem
   unidade não são conferidos, ver `status/ESTADO.md` de 26/08), e a exigência de
   tentativa 1 limpa é a única salvaguarda que sobrou no lugar da revisão humana. E o item
   2 abaixo (remote sem REGRA 6) passa a significar que, num dia em que o Worker remoto
   reivindicar a corrida, a lista de clientes não recebe nada naquele dia, silenciosamente,
   sem alerta dedicado (o watchdog das 07h20 só cobre o envio padrão ao Yan).

   A pergunta do item 3 abaixo (Resolução CVM 20) segue sem resposta. O Yan decidiu
   prosseguir com o envio mesmo assim; é decisão dele como operador, não uma checagem que
   o agente fez ou pôde fazer.

2. **O Worker de reserva ficou para trás do portão numérico.** Achado em 24/08, e é
   consequência direta da correção do mesmo dia ter tocado só um dos dois caminhos.

   O pipeline local ganhou injeção de cotação no prompt e a REGRA 6 no validador. O
   `briefing-interno/remote/`, que roda no Cloudflare às 07:05 quando a máquina está
   desligada, tem zero dos dois. Medido, `grep` por `precos` em
   `remote/src/generate/briefing.js` dá 0, e por `REGRA 6` em
   `remote/src/validate/briefing.js` dá 0, contra 3 e 8 nos equivalentes locais.

   Na prática, num dia em que o local não reivindique a corrida, o briefing sai com
   número que ninguém conferiu, exatamente o defeito de 20/08.

   Alcance limitado, e isso é o que segura a severidade. O remote manda para um
   destinatário único (`to: [toEmail]`) e a seção "Fallback remoto" abaixo registra que o
   local é o único caminho com `--clientes`. Cliente não recebe pelo remoto hoje.

   A armadilha é para depois. Quem ligar cliente no caminho remoto sem portar a REGRA 6
   reabre o buraco inteiro sem perceber, porque o local vai estar verde. Portar antes de
   qualquer mudança no alcance do remote.

3. **Resolução CVM 20 não verificada.** Distribuir análise direcional com nível de
   confiança para 22 pessoas entra no território de analista de valores mobiliários. O
   enquadramento do registro e a existência de disclaimer no template não foram checados.
   Decisão do operador, não do agente.

4. **Quarenta e sete itens abertos e confirmados no `PENDENCIAS.md`.** Os que mais pesam.
   MC-002 e MC-013, a pipeline duplicada em `src/orchestrator/run.ts` continua viva com
   204 linhas de teste cobrindo código que não roda em produção, enquanto o Workflow real
   não tem teste de integração. MC-017, nenhum fetch em `src/data/` tem timeout, um
   provider pendurado trava o cron. RQ-16, o worker do radar-quant não tem uma linha de
   log estruturado. RQ-28 e RQ-29, `signals:latest` e os contadores de cota seguem em
   read-modify-write cego no KV, duas gerações concorrentes perdem entrada em silêncio.
   MC-019, a tabela `agent_calls` existe e nada escreve nela, então não há custo por
   agente.

5. **Um teste do remote falha por drift de artefato, não por bug.** A suíte própria do
   `briefing-interno/remote/` (`npm test` lá dentro, não entra no `npm test` da raiz) tem
   34 casos, 33 passam. O que falha é `buildUserPrompt bate byte a byte com o Python`.

   Ele lê `Site/site-producao/agenda-data.json`, arquivo vivo, e compara contra uma
   fixture congelada em 18/08. A agenda andou, então a fixture não bate mais. Diferença
   localizada na posição 15387, onde o esperado tem os eventos de 18/08 e a execução atual
   produz "NENHUM evento confirmado para hoje".

   Verificado que é anterior às mudanças de 24/08, mesma contagem com e sem elas, medido
   com `git stash`. Mesma classe do achado Q02, teste acoplado a artefato vivo. O conserto
   é congelar a agenda numa fixture própria, não regenerar o esperado, que só empurra o
   drift para a frente.

6. **DEPLOY-03, worker órfão.** `szuchmacher-briefing` existe na conta Cloudflare, id
   `1bf0b671370f46089aac738257d753ab`, criado em 17/06 e sem deploy desde 20/07. Sem
   nenhuma referência no repo. Apagar Worker é destrutivo, precisa de ordem tua.

7. **REGRA 6 cobre só 15 ativos.** O portão numérico confere o que está em
   `ATIVOS_META` (`briefing-interno/scripts/_comum.py`). Qualquer número fora dessa lista,
   ação estrangeira, dado de emprego, exportação, passa sem conferência automática e fica
   por conta do revisor humano (`briefing-interno/templates/checklist-qa.md`).

8. **`comparar_realizado.py` adiado.** O registro de visão diária começou em 24/08 com
   `gravar_visao.py`. O comparador contra o realizado só faz sentido com série, alvo de 30
   dias úteis em `briefing-interno/visao/`. Construir antes é gerador de relatório sem nada
   para relatar.

### Fechadas em 2026-08-24

- **Lint do monorepo.** Estava vermelho com 19 erros, todos `Parsing error` em
  `briefing-interno/remote/` por falta de tsconfig, o que significava que 19 arquivos do
  Worker de reserva nunca tinham passado por análise estática. Resolvido com
  `disableTypeChecked` restrito ao diretório, mantendo as regras sintáticas. Os 18
  problemas reais que apareceram foram corrigidos, incluindo dois NBSP invisíveis dentro
  de um literal de regex e quatro `throw` que perdiam o stack da causa. O portão
  (`npm test && npm run typecheck && npm run lint`) fecha limpo, 317 testes e exit 0 nos
  três.
