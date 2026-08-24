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

Status reconciliado em 24/08, os 58 achados conferidos um por um contra o código. Zero
linhas em `NOVO`. Resultado, 20 resolvidos e 38 abertos. Detalhe na seção "Reconciliação
de status" do `PENDENCIAS.md`.

1. **Trinta e oito itens abertos e confirmados.** Os que mais pesam. MC-002 e MC-013, a
   pipeline duplicada em `src/orchestrator/run.ts` continua viva com 204 linhas de teste
   cobrindo código que não roda em produção, enquanto o Workflow real não tem teste de
   integração. MC-017, nenhum fetch em `src/data/` tem timeout, um provider pendurado
   trava o cron. RQ-16, o worker do radar-quant não tem uma linha de log estruturado.
   RQ-28 e RQ-29, `signals:latest` e os contadores de cota seguem em read-modify-write
   cego no KV, duas gerações concorrentes perdem entrada em silêncio. MC-019, a tabela
   `agent_calls` existe e nada escreve nela, então não há custo por agente.

2. **DEPLOY-03, worker órfão.** `szuchmacher-briefing` existe na conta Cloudflare, id
   `1bf0b671370f46089aac738257d753ab`, criado em 17/06 e sem deploy desde 20/07. Sem
   nenhuma referência no repo. Apagar Worker é destrutivo, precisa de ordem tua.

2. **Envio a clientes segurado desde 24/08.** O Morning Call passou a ir para 22
   destinatários em BCC. O envio foi travado no mesmo dia depois que a auditoria achou
   número de mercado escrito de memória pelo LLM. Critério para religar, três briefings em
   dias úteis consecutivos passando a REGRA 6 sem intervenção manual. Só então criar o
   flag `logs/aprovacao_clientes_<data>.flag`, que é ato deliberado e nunca rotina.

3. **Resolução CVM 20 não verificada.** Distribuir análise direcional com nível de
   confiança para 22 pessoas entra no território de analista de valores mobiliários. O
   enquadramento do registro e a existência de disclaimer no template não foram checados.
   Decisão do operador, não do agente.

4. **REGRA 6 cobre só 15 ativos.** O portão numérico confere o que está em
   `ATIVOS_META` (`briefing-interno/scripts/_comum.py`). Qualquer número fora dessa lista,
   ação estrangeira, dado de emprego, exportação, passa sem conferência automática e fica
   por conta do revisor humano (`briefing-interno/templates/checklist-qa.md`).

5. **`comparar_realizado.py` adiado.** O registro de visão diária começou em 24/08 com
   `gravar_visao.py`. O comparador contra o realizado só faz sentido com série, alvo de 30
   dias úteis em `briefing-interno/visao/`. Construir antes é gerador de relatório sem nada
   para relatar.

3. **Lint do monorepo reprova, e o motivo é pior que estilo.** `npm run lint` sai com
   19 erros e 8 avisos. Estado anterior a 24/08, provado: nenhum commit desta data tocou
   os arquivos que falham, e o `eslint.config.js` só trocou `apps/radar-quant/` por
   `radar-quant-brasil/` no ignore.

   Os 19 erros são todos `Parsing error: was not found by the project service` em
   `briefing-interno/remote/`, 12 arquivos em `src/` e 7 testes `.mjs`. O diretório não
   tem `tsconfig` próprio e não está no ignore do ESLint, então a ferramenta não consegue
   abrir nenhum deles. **Não é que esses arquivos reprovaram, é que nunca foram
   verificados.** E são o Worker de reserva que envia o briefing quando a máquina local
   está desligada, ou seja, código de caminho de envio sem análise estática nenhuma desde
   que nasceu em 19/08.

   Ignorar é o conserto errado. `remote/` é fonte, não bundle gerado, diferente das
   entradas que já estão no ignore (`dist/`, `dist-assets/`, `.wrangler/`, worktrees).
   O caminho é dar um `tsconfig` ao `remote/` ou incluí-lo num existente, e então ver o
   que o lint tem a dizer sobre 19 arquivos que ninguém nunca checou.

   Os 8 avisos são `no-console` em `apps/morning-call/src/data/agenda/`, cosméticos ao
   lado disso.

   Enquanto não fechar, o portão de aceite do projeto (`npm test && npm run typecheck &&
   npm run lint`) não passa limpo. Test e typecheck estão verdes, 317 testes em 24/08.
