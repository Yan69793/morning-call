# DIAGNÓSTICO — Morning Call (briefing-interno), pré-voo de envio 24/08/2026
**Data:** 2026-08-24 03:50 BRT
**Alvo:** pipeline `briefing-interno` (Task Scheduler local), envio automático das 07h00
**Método:** auditoria generalista, escopo reduzido (pergunta do usuário é pré-voo de envio, não auditoria completa) — Bloco A (drift) + Bloco F (automação) completos, C/D/E fora de escopo (ver seção 6)
**Raw:** audit-raw-2026-08-24.json

## 1. Descoberta e drift

- HEAD do repo: `285b867` "docs(briefing): registra MODELVAR1 no CLAUDE.md do briefing-interno".
- `git status` restrito a `briefing-interno/`: limpo, zero arquivo modificado/novo/deletado. O que roda às 07h00 é exatamente o que está commitado e documentado, sem drift.
- Resto do monorepo tem diffs grandes não commitados (reestruturação `apps/radar-quant` → `radar-quant-brasil/`, configs de raiz). Fora de escopo desta pergunta, não toca o pipeline do briefing.

## 2. Automação (Task Scheduler)

| Task | State | Último run | Resultado | Próximo run |
|---|---|---|---|---|
| Szuchmacher-BriefingMatinal | Ready | 23/08 07:00:01 | 0 (sucesso) | 24/08 07:00:00 |
| Szuchmacher-BriefingWatchdog | Ready | 23/08 07:20:01 | 0 (sucesso) | 24/08 07:20:00 |

Nenhuma task `Szuchmacher-EnvioClientes` ativa (ela só existe quando criada para uma aprovação pontual de envio a clientes e se autodestrói ao rodar). Confirma que não há envio a lista de clientes armado para hoje.

## 3. Evidência do último envio real

- 22/08 (sáb) e 23/08 (dom): fim de semana, pipeline pulou corretamente (checagem de `DayOfWeek` em `run_briefing.ps1`), sem sentinela `sent_*.flag`, comportamento esperado, não é falha.
- Último envio real de dia útil: **21/08**, `logs/briefing_20260821_py.log` — APROVADO na tentativa 1 de 3, `ENVIADO OK` às 07:01:47. Não precisou do fallback de modelo (MODELVAR1).
- 20/08 é o único dia útil recente sem `sent_*.flag`: as 3 tentativas reprovaram no portão (falha correlacionada, mesmo modelo 3x), fail-closed funcionou como projetado, motivou o fix MODELVAR1 do dia seguinte. Não é falha do sistema, é o gate fazendo o trabalho dele.

## 4. Correções do PENDENCIAS.md verificadas contra o código atual

| ID | Achado original | Estado no código hoje |
|---|---|---|
| W01 | `run_briefing.ps1`: `return` em vez de `exit`, mascarava falha pro Task Scheduler | RESOLVIDO — script atual usa `exit` em todo ponto de saída (linhas 70, 83, 90, 138, 142, 184, 189, 209, 243) |
| W02 | `run_envio_clientes.ps1:32`: `$HtmlDoDia` sem aspas, quebra com espaço no path | RESOLVIDO — linha 32 atual já usa `"$HtmlDoDia"` entre aspas |
| W03 | mesmo script: `$ProjectRoot` hardcoded + `return` | RESOLVIDO — linha 9 usa `Split-Path -Parent $PSScriptRoot`, saídas usam `exit` |

A tabela do `PENDENCIAS.md` ainda marca os três como `NOVO`; é a tabela que está desatualizada, não o código. Recomendo marcar `RESOLVIDO` no próximo repeat-run.

## 5. Política de lista de envio

- Decisão de 14/08/2026 (`briefing-interno/CLAUDE.md`): envio a clientes **cancelado**, briefing sai sempre e apenas para o Yan (`TO_EMAIL`) + `TO_EMAIL_EXTRA` em BCC.
- Única exceção documentada desde então: 19/08/2026, ordem pontual do Yan, lista do Fechamento, via `logs/aprovacao_clientes_20260819.flag`.
- Para 24/08/2026, no momento da coleta (03h50): nenhum `aprovacao_clientes_20260824.flag`, nenhuma task `EnvioClientes` ativa.

### Atualização 04h05 do mesmo dia: ordem nova do Yan

Depois desta coleta o Yan mandou enviar também à lista de clientes hoje, e escolheu o modo pré-autorizado (flag criado antes de o briefing existir, sem revisão prévia do e-mail das 07h00). Armado nesta sessão:

- `logs/aprovacao_clientes_20260824.flag` criado.
- Task pontual `Szuchmacher-EnvioClientes` registrada, disparo único 24/08 09h00, State Ready, auto-remove ao terminar.
- Lista viva do `.env` do Fechamento: 22 destinatários únicos após dedup (21 em 19/08, um endereço novo entrou).
- `StartWhenAvailable` omitido de propósito: PC desligado às 09h00 significa nada enviado, em vez de briefing matinal chegando ao cliente à tarde.

Gate remanescente: `enviar_briefing.py` revalida o HTML (`_validar`, exit 9) antes do ramo `--clientes`, então conteúdo reprovado no portão não alcança clientes mesmo com o flag. O que se perdeu foi a revisão de julgamento, não a de formato. Registrado em `briefing-interno/CLAUDE.md`.

## 6. Lacunas explícitas (não coletado)

- `.env`: confirmada só a existência do arquivo, conteúdo não lido (política de não expor secrets).
- Worker de fallback `sz-briefing-remote`: não consultado `/health` agora — desnecessário, o caminho local está Ready e é o primário; o remoto só age se o local não reivindicar o dia.
- Blocos C (UI/Playwright), D (headers/CSP) e E (infra Cloudflare) não rodados — pergunta era pré-voo de um envio local via Task Scheduler, sem componente web/Worker no caminho crítico do envio.
- Não dá para garantir de antemão que o conteúdo gerado às 07h00 de hoje vai passar no validador (depende das notícias e da resposta do modelo do dia); isso só se confirma depois da execução real, pelo log e pela sentinela `sent_20260824.flag`.

## 7. Problemas (P0/P1/P2/P3)

### P0-001 — E-mail sai vazio quando o modelo não usa cabeçalho (CORRIGIDO nesta sessão)

Encontrado no teste seco pedido pelo Yan às 04h20, antes do envio a clientes.

**Correção de rumo.** A primeira versão desta seção afirmava que o e-mail de 21/08 tinha chegado vazio ao Yan. Ele conferiu a caixa e desmentiu: chegou normal. O erro foi meu, tratei o artefato em disco como prova do que foi entregue. `outputs/briefing_20260821.html` tem mtime 16:17:19, nove horas depois do envio das 07:01:47, e 1886 chars contra os 3951 do log. Foi sobrescrito naquela tarde pelo teste seco do MODELVAR1. Nenhum e-mail vazio foi enviado até hoje.

**O defeito é real e está armado.** Quem gera o formato que quebra é o `meta-llama/llama-3.3-70b-instruct`, e o MODELVAR1 (21/08) tornou esse o primeiro modelo da cadeia a partir da tentativa 2. Em 21/08 aprovou na tentativa 1; 22 e 23 foram fim de semana. A combinação nunca chegou a um envio real, e bastava um dia em que a tentativa 1 reprovasse. Hoje seria o primeiro dia útil exposto, com 22 clientes na ponta.

**Causa raiz.** `_BriefingContent.handle_data` retorna cedo enquanto `self._current` for None ([enviar_briefing.py:160](../scripts/enviar_briefing.py:160)), e `_current` só nasce ao encontrar `<h1>`/`<h2>` ([:131](../scripts/enviar_briefing.py:131)). A saída do llama marca seção só com `<b>` e agenda com hífen, zero `<h1>` no documento:

```
briefing_20260817.html  h1/h2=4   p=1   li=3   b=2   gemma   render OK
briefing_20260818.html  h1/h2=3   p=6   li=2   b=5   gemma   render OK
briefing_20260819.html  h1/h2=3   p=6   li=3   b=5   gemma   render OK
briefing_20260820.html  h1/h2=3   p=6   li=3   b=5   gemma   render OK
briefing_20260821.html  h1/h2=0   p=0   li=0   b=6   llama   CORPO VAZIO
```

**Defeito acoplado.** A remoção de fontes de 19/08 procura literalmente `<h1>O QUE IMPORTA HOJE</h1>`, então no formato de 21/08 também falhava calada e os rótulos de veículo vazariam para o e-mail, contra ordem expressa do Yan.

**Por que passaria por todos os portões.** O validador roda sobre o HTML cru por desenho e não enxerga `build_styled_email`. Terceira manifestação do mesmo ponto cego, depois de 13/08 e 17/08.

**Lição de método.** Artefato em disco não é prova do que foi entregue quando o pipeline reescreve o mesmo caminho. Conferir mtime contra a hora do envio no log antes de tratar um output como evidência do que o destinatário recebeu.

**Correção.** `_normalizar_estrutura` converte a entrada à forma canônica antes do parse (bold-só vira `<h1>`, hífen e numeração do modelo viram `<li>`), preservando todo o fluxo já exercitado dos dias bons. `_corpo_suficiente` é trava independente chamada em `_send_resend` antes do POST, que barra o envio se o corpo vier vazio ou abaixo de 50% do texto cru. Regressão em `TestBriefingSemCabecalho` (T08) e `TestTravaEmailVazio` (T09).

**Prova pós-correção, 5 dias reais reprocessados:**

```
briefing_20260817.html  cru 1223  corpo 1148  94%  PASSA  0 ancoras
briefing_20260818.html  cru 2457  corpo 2261  92%  PASSA  0 ancoras
briefing_20260819.html  cru 2405  corpo 2259  94%  PASSA  0 ancoras
briefing_20260820.html  cru 2125  corpo 1993  94%  PASSA  0 ancoras
briefing_20260821.html  cru 1400  corpo 1263  90%  PASSA  0 ancoras
```

Suíte: 32 testes verdes (eram 21 antes desta sessão).

### P3-001 — Tabela do PENDENCIAS.md desatualizada

W01/W02/W03 marcados `NOVO` mas resolvidos em código (seção 4).

## 8. OK sem ação

- Task Scheduler armado e saudável (Matinal + Watchdog, ambos Ready, última execução com sucesso).
- Código do pipeline sem drift (disco = HEAD).
- Último envio real (21/08) limpo, aprovado de primeira tentativa.
- Fail-closed do envio a clientes intacto: sem flag, sem task, nada sai por engano hoje.

## 9. Próximos passos

- Nenhuma ação necessária para o envio padrão de hoje (Yan + Yara) às 07h00.
- Envio a clientes das 09h00 armado e pré-autorizado (ver atualização na seção 5). Conferir depois pelos sentinelas `logs/sent_clientes_20260824.flag` e pela linha `CLIENTES: enviar_briefing exit 0` em `logs/briefing_20260824.log`.
- Se o briefing das 07h00 reprovar no portão nas 3 tentativas, o envio a clientes das 09h00 também não acontece (exit 9 na revalidação), e a task se auto-remove. Nesse cenário nada sai para ninguém e o watchdog das 07h20 avisa.
- Housekeeping de baixa prioridade: marcar W01/W02/W03 `RESOLVIDO` no `PENDENCIAS.md`.
