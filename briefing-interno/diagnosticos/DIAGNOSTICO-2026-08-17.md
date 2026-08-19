# DIAGNÓSTICO — Briefing Matinal (Morning Call / briefing-interno)

**Data:** 2026-08-17 09:30 BRT
**Alvo:** pipeline local das 07h00 (`E:\Diretorio\Claude\FREQUENTE\Morning Call\briefing-interno`), etapa de renderização do e-mail (`enviar_briefing.py`)
**Gatilho:** Yan reportou que o "PANORAMA DIARIO" recebido por e-mail veio com citação de fonte vazia e itens duplicados
**Método:** auditoria generalista (blocos A e F, code trace do parser) — sem Bloco B/C/D/E porque o alvo é pipeline Python local, não sistema web/Worker

## Síntese

O arquivo em disco (`outputs/briefing_20260817.html`), que é o que `validar_briefing.py` valida, está correto: os dois itens de "O QUE IMPORTA HOJE" têm título, corpo e fonte (InfoMoney, linkada) intactos. O e-mail efetivamente enviado não bate com esse arquivo porque a re-estilização feita em `enviar_briefing.py` na hora do envio (`build_styled_email` / classe `_BriefingContent`) tem dois bugs de parsing HTML que corrompem justamente os itens com `<b>` dentro de `<li>` e com fonte citada como link inline (`<a>Nome</a>`) em vez de `[url]` entre colchetes. O validador nunca vê essa etapa, porque ele roda sobre o HTML cru, não sobre o HTML estilizado que sai pelo Resend.

O defeito já se realizou: dois envios reais saíram hoje (07:54 e 08:06), ambos com o e-mail quebrado. O segundo só é possível com `--force` (a trava de idempotência bloquearia reenvio simples), o que sugere execução manual deliberada, possivelmente para um destinatário diferente do padrão. Ver pendência em "Próximos passos".

## Estado do dia

| Item | Evidência |
|---|---|
| Rodada automática 07:00:02 | `gerar_briefing.py` OK (2807 chars, google/gemma-3-27b-it:online) |
| Validação 07:01:50 (1ª rodada) | REPROVADO — REGRA 1 (2 URLs fora do pool) + REGRA 2 (formato de confiança fora do padrão) |
| Launcher 07:01:50 | exit 1, envio abortado |
| Watchdog 07:20:02/07:20:03 | ALERTA disparado corretamente (briefing não enviado às 07h00) |
| `logs/validacao_20260817.json` (estado atual) | `"resultado": "APROVADO"`, 2 URLs no HTML, 2 confianças — reflete uma rodada corrigida, posterior à 1ª |
| `logs/briefing_20260817.log` | `ENVIAR_BRIEFING ENVIADO_OK` às **07:54:32** e de novo às **08:06:44** (dois envios reais) |
| `outputs/briefing_20260817.html` (disco) | Íntegro: 2 itens, cada um com `<b>título</b>`, corpo, `(confiança: X.X)` e `<a href>Fonte</a>` completos |
| Texto colado por Yan (e-mail recebido) | Item 1 termina em "conforme reportado pela ." (sem nome da fonte); item 2 é só o título do item 1 repetido, sem corpo; item 3 termina em "conforme a ."; item 4 é só o título do item 3 repetido |
| `.env` → `TO_EMAIL` | `szuchmacheryan@gmail.com` (destinatário padrão, é o próprio Yan) |
| `git status` | só `gerar_briefing.py` modificado (ajuste no formato exigido de "confiança: X.X" no prompt) — **não** toca `enviar_briefing.py`, o bug já existia antes dessa mudança |

## Achados

### P0-001 — Briefing com conteúdo corrompido já foi enviado por e-mail, duas vezes

`logs/briefing_20260817.log` registra `ENVIADO_OK` às 07:54:32 e 08:06:44. Como o defeito está na renderização do e-mail (achados P1 abaixo), os dois envios saíram com fonte cortada e itens duplicados, iguais ao que Yan recebeu e colou no chat. E-mail já enviado não tem como ser puxado de volta, é o próprio princípio central documentado em `briefing-interno/CLAUDE.md` ("Briefing errado é problema grande, e não tem como voltar atrás depois de enviado").

### P1-001 — Parser do e-mail descarta o texto de qualquer link, mas o modelo às vezes cita a fonte como link inline em vez de `[url]`

`enviar_briefing.py:159-176`, método `_BriefingContent.handle_data`: qualquer texto dentro de `<a>...</a>` é descartado incondicionalmente (`if self._a_depth > 0: return`), partindo do princípio de que citação de fonte sempre aparece como `[https://...]` entre colchetes — formato que `_strip_fonte_e_confianca` (linha 194) sabe remover via regex. Hoje o modelo (`google/gemma-3-27b-it:online`) escreveu a fonte como link natural embutido na frase, `conforme reportado pela <a href="...">InfoMoney</a>`, onde o nome "InfoMoney" é parte da frase, não uma citação descartável. O parser apaga "InfoMoney" e deixa só o conectivo e o ponto final, exatamente o "conforme reportado pela ." e "conforme a ." que Yan recebeu.

### P1-002 — Título em negrito dentro de `<li>` vaza para fora do item e vira ponto fantasma duplicado

Mesmo método, mesmo arquivo: o roteamento de `handle_data` olha só `self._stack[-1]` (o topo imediato da pilha de tags), não a ancestralidade completa. Quando `<b>` abre dentro de `<li>`, o topo passa a ser `"b"`, e o texto cai no ramo `elif top == "b" or top is None`, que foi escrito para o caso de texto solto direto na seção (sem `<li>`/`<p>`, onde o negrito marca o início de um ponto novo — formato alternativo que o modelo às vezes usa). Esse mesmo ramo dispara mesmo quando o `<b>` está dentro de um `<li>` de verdade, então: (1) o título some do item real, que passa a começar no meio da frase; (2) o título órfão fica em `self._bare_segments` até o próximo `<li>` (ou fim do documento) disparar `_flush_bare()`, que o injeta como um item "p" novo na seção; (3) `build_styled_email` (linha 348) trata todo "p" dentro de "O QUE IMPORTA HOJE" como ponto numerado próprio, então o título vazado vira uma linha numerada inteira só com o título repetido. É exatamente o item 2 e o item 4 que Yan recebeu.

Os dois bugs são independentes, mas o item do dia (`<li><b>título</b> corpo... <a>Fonte</a>.</li>`) aciona os dois ao mesmo tempo.

## OK sem ação

- Portão de validação (`validar_briefing.py`) funcionou como projetado na 1ª rodada: reprovou REGRA 1 e REGRA 2 corretamente e bloqueou o envio automático das 07h00.
- Watchdog disparou o alerta às 07:20 como esperado.
- `gerar_briefing.py` (diff não commitado) resolve exatamente a causa da reprovação REGRA 2 da 1ª rodada (formato de confiança) — mudança correta, não relacionada ao bug P1-001/P1-002.
- Coleta de notícias, coleta de estado e geração via OpenRouter rodaram sem erro.

## Próximos passos — resolvido em 17/08/2026

1. **Feito.** `_BriefingContent.handle_data` corrigido: roteia por container aberto (`self._li_segments`/`self._p_segments` não-None) em vez do topo da pilha, e `<a>` virou transparente (preserva o texto visível, só o href some). Regressão coberta em `tests/test_pipeline_robustez.py::TestBriefingContentParser` (T06), suíte completa rodada (`python -m unittest discover -s tests`, 19 testes, todos OK). Verificado localmente contra o HTML real de 17/08 (sem reenviar nada): os dois itens saem com título, corpo e fonte intactos. Documentado em `briefing-interno/CLAUDE.md`.
2. **Respondido pelo Yan.** O envio das 08:06:44 para "Silvia" (`sreneeg51@gmail.com`) foi intencional, endereço válido, conhecido do Yan. Não é incidente de destinatário, só reforça que a versão enviada (a essa e à caixa padrão) estava quebrada — coberto pelo P0-001 independentemente de quem recebeu.
3. **Respondido pelo Yan.** Mantida a arquitetura de conteúdo embutido no e-mail. Não migrar para o modelo do Fechamento (e-mail curto + link para página hospedada) por ora, isso exigiria criar hospedagem de relatório para o Morning Call, que não existe.
