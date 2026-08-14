# Plano: correção dos blocos 1 e 3 da auditoria (2026-08-14)

**Goal:** Rotina das 07h00 com exit codes verdadeiros e fronteiras resilientes (bloco 1, sem deploy) e eliminação do null-as-zero no gate de sinais do radar-quant (bloco 3, com teste, sem deploy).

**Preconditions:** repo em `main`, commit `798c1ff`; `python` no PATH; `npm` no root do monorepo; nada depende de deploy.

**Contexto das regras:** scripts chamados pelo Task Scheduler usam `exit` (regra do CLAUDE.md global, bug documentado de 06/08); `return` só dentro de função. Deploy fica de fora destes blocos, é ação humana explícita.

---

### Task 1: exit codes reais no run_briefing.ps1 (W01)
**File:** `E:\Diretorio\Claude\FREQUENTE\Morning Call\briefing-interno\scripts\run_briefing.ps1`
**Action:** Edit
**What to do:** Trocar os 7 `return` de escopo de script (linhas 69, 82, 89, 122, 132, 138, 153) por `exit` com o mesmo valor (ex.: `return 5` vira `exit 5`). NÃO mexer nos `return` das linhas 31 e 60, que estão dentro de função.
**Verification:** `Select-String -Path <arquivo> -Pattern "^\s*(return|exit)"` mostra exit nas 7 linhas e return só em 31/60. Depois rodar o script: como `sent_20260814.flag` existe, deve pular o envio e terminar com `$LASTEXITCODE -eq 0`.
**Depends on:** none

### Task 2: run_envio_clientes.ps1 correto (W03 + W02)
**File:** `E:\Diretorio\Claude\FREQUENTE\Morning Call\briefing-interno\scripts\run_envio_clientes.ps1`
**Action:** Edit
**What to do:** (a) linhas 22, 29, 38: `return` de escopo de script vira `exit` com o mesmo valor; (b) linha 9: `$ProjectRoot = Split-Path -Parent $PSScriptRoot`; (c) linha 32: aspas duplas em `"$HtmlDoDia"`.
**Verification:** rodar o script manualmente. Sem `aprovacao_clientes_20260814.flag` ele deve logar "SEM APROVACAO" e não enviar nada (comportamento atual, fail-closed). Conferir a linha no log `logs\briefing_20260814.log`.
**Depends on:** none

### Task 3: JSONDecodeError do OpenRouter cai no fallback (T01)
**File:** `E:\Diretorio\Claude\FREQUENTE\Morning Call\briefing-interno\scripts\gerar_briefing.py`
**Action:** Edit
**What to do:** No bloco em torno da linha 271, capturar `json.JSONDecodeError` junto do `except` existente e converter para `RuntimeError` com mensagem clara, para o cascade avançar ao próximo provedor.
**Verification:** `python -m py_compile scripts\gerar_briefing.py` sem erro. Teste unitário novo em `tests/` com corpo não-JSON via mock de `urlopen` (ou função helper extraída), rodando `python tests/test_validar_briefing.py` sem quebra e o teste novo passando.
**Depends on:** none

### Task 4: guarda do dias_atraso no coletor de estado (T03)
**File:** `E:\Diretorio\Claude\FREQUENTE\Morning Call\briefing-interno\scripts\coletar_estado.py`
**Action:** Edit
**What to do:** Linha ~232: `(staleness.get("dias_atraso", 0) >= 2)` vira `(staleness.get("dias_atraso") or 0) >= 2`, eliminando o TypeError quando `_calc_staleness` devolve None.
**Verification:** `python -m py_compile scripts\coletar_estado.py` sem erro + teste unitário de `_calc_staleness` com marketDate inválido devolvendo None sem crash.
**Depends on:** none

### Task 5: fronteira do VixRadar exige dict + status (T05)
**File:** `E:\Diretorio\Claude\FREQUENTE\Morning Call\briefing-interno\scripts\coletar_estado.py`
**Action:** Edit
**What to do:** Nas linhas ~255-265: `if vx:` vira `if isinstance(vx, dict) and isinstance(vx.get("status"), str):`, senão `ok: False` com aviso, eliminando AttributeError e o "Status: ?" de hoje.
**Verification:** `python -m py_compile` + teste unitário com resposta array JSON e resposta sem status.
**Depends on:** none

### Task 6: GDELT consertado e erro distinto de rate limit (O02)
**File:** `E:\Diretorio\Claude\FREQUENTE\Morning Call\briefing-interno\scripts\coletar_noticias.py`
**Action:** Edit
**What to do:** Nas linhas ~153-156 e 172-178: envolver os termos OR com parênteses `(ibovespa OR bovespa OR ...)`; quando a resposta citar "surrounded by ()", classificar como erro de sintaxe e logar isso, não "provavel rate-limit".
**Verification:** `python -m py_compile` + teste unitário do builder de query garantindo parênteses.
**Depends on:** none

### Task 7: coletar_estado lê .env de verdade (I01)
**File:** `E:\Diretorio\Claude\FREQUENTE\Morning Call\briefing-interno\scripts\coletar_estado.py`
**Action:** Edit
**What to do:** Chamar `_load_env()` no início do main, e nas 3 leituras de URL de worker (linhas ~187-189, 210-212, 251-253) usar a convenção `env.get(...) or os.environ.get(...)` já usada no `gerar_briefing.py:104`.
**Verification:** `python -m py_compile` + rodar o coletor real uma vez (rede OK hoje às 07h) conferindo que as 3 URLs resolvem igual ao log de hoje.
**Depends on:** 4, 5

### Task 8: fronteira Resend exige id (T02)
**File:** `E:\Diretorio\Claude\FREQUENTE\Morning Call\briefing-interno\scripts\enviar_briefing.py`
**Action:** Edit
**What to do:** Linhas ~491-492: capturar `json.JSONDecodeError`; linha ~505: declarar sucesso só se `isinstance(result, dict) and result.get("id")`.
**Verification:** `python -m py_compile` + teste unitário com resposta 200 sem corpo JSON e com shape sem id.
**Depends on:** none

### Task 9: null real no lugar de `?? 0` no signals.ts (B-004/B-005/B-006)
**File:** `E:\Diretorio\Claude\FREQUENTE\Morning Call\apps\radar-quant\worker\src\routes\signals.ts`
**Action:** Edit
**What to do:** Linhas 50-54: `ibovScore`, `vixLast`, `usdbrlLast` passam a `?? null` tipados `number | null`. `vixRiscoOff` passa a `vixLast === null ? null : vixLast >= 25` (sem dado não abre risco nem fecha).
**Verification:** `npm run typecheck` acusa os pontos que ainda esperam number (ajustar nas tasks 10-12 até ficar limpo).
**Depends on:** none

### Task 10: gate de swing trata null como sem dado
**File:** `E:\Diretorio\Claude\FREQUENTE\Morning Call\packages\analytics\src\signal-rules.ts`
**Action:** Edit
**What to do:** `evaluateSwingSetup` aceita `ibovScore: number | null` e `vixRiscoOff: boolean | null`; com qualquer um null, a decisão não pode virar LONG por default (fail-closed: sem dado não vota favorável). Ajustar assinatura e lógica interna, mantendo o comportamento atual para entradas não-nulas.
**Verification:** testes novos em `packages/analytics/tests/` provando que score ausente NÃO produz LONG e vix ausente NÃO abre o gate de risco; `npm test` no workspace do pacote passa.
**Depends on:** 9

### Task 11: contrato nulável no payload parseado (B-007)
**File:** `E:\Diretorio\Claude\FREQUENTE\Morning Call\apps\radar-quant\worker\src\routes\signals.ts`
**Action:** Edit
**What to do:** Antes de chamar o motor, guardar os campos do item com checagem `typeof` (score, metrics.ret_20d, rangePos_60d, upDays_5, quality.symbolError); item sem esses dados devolve 422/"dados insuficientes" em vez de seguir com null coageado.
**Verification:** teste de rota com scan fixture sem `metrics` devolvendo erro controlado, sem 500; `npm test -w @sz/radar-quant-worker` passa.
**Depends on:** 9

### Task 12: MacroCtx e prompt tratam sem dado (B-006)
**File:** `E:\Diretorio\Claude\FREQUENTE\Morning Call\apps\radar-quant\worker\src\lib\anthropic.ts`
**Action:** Edit
**What to do:** `MacroCtx.ibovScore`, `vixLast`, `usdbrlLast` viram `number | null`; no builder de prompt, null vira o texto "sem dado" em vez de 0.
**Verification:** `npm run typecheck` limpo e teste do builder de prompt com null não emitindo "0".
**Depends on:** 9

### Task 13: portão do monorepo completo
**File:** root do repo
**Action:** Run
**What to do:** `npm test` e `npm run typecheck` e `npm run lint` da raiz do monorepo, com saída colada.
**Verification:** os três comandos saem 0; nenhum teste quebrado.
**Depends on:** 9, 10, 11, 12

### Task 14: commits separados por bloco
**File:** repo
**Action:** Run
**What to do:** commit 1 com os arquivos do briefing-interno (tasks 1-8); commit 2 com signals.ts, signal-rules.ts, anthropic.ts e testes (tasks 9-12). Mensagens `fix(briefing-interno): ...` e `fix(radar-quant): ...` no estilo do repo. Não incluir `apps/radar-quant/scripts/register-scan-diario-task.ps1`.
**Verification:** `git status` limpo exceto o arquivo alheio; `git log -2` mostra os dois commits.
**Depends on:** 13

---

**Rollback:** tudo é código sem deploy. `git revert` dos dois commits devolve o estado anterior; a rotina das 07h00 de amanhã continua funcionando com o código atual em caso de problema noturno.
