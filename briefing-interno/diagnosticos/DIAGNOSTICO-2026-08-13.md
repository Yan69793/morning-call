# DIAGNÓSTICO — Briefing Matinal (Morning Call / briefing-interno)

**Data:** 2026-08-13 08:35 BRT
**Alvo:** pipeline local das 07h00 (`E:\Diretorio\Claude\FREQUENTE\Morning Call\briefing-interno`)
**Gatilho:** briefing das 07h00 não enviado, alerta do watchdog às 07:20
**Método:** auditoria generalista (foco em automação, blocos A/B/F) + recuperação do envio do dia

## Síntese

O briefing não saiu às 07h00 porque o launcher não encontrou o `pwsh.exe`: o App Execution Alias da Store virou arquivo de 0 byte depois de atualização automática do pacote MSIX (padrão já visto em 27/07 no fechamento). A recuperação manual do dia revelou três defeitos de código mascarados até hoje, todos corrigidos, e o portão de validação pegou uma URL inventada pelo modelo, que foi removida. O briefing de 13/08 foi aprovado e enviado às 08:32.

## Estado do dia

| Item | Evidência |
|---|---|
| Task `Szuchmacher-BriefingMatinal` 07:00:01 | LastResult 0x00000001 |
| Log do launcher 07:00:04 | `ERRO nenhum pwsh.exe executavel encontrado (PWSHALIAS1)` |
| Watchdog 07:20:01 | LastResult 0x00000003, alerta enviado |
| Alias Store `%LOCALAPPDATA%\Microsoft\WindowsApps\pwsh.exe` | 0 byte, sem reparse point |
| Pacote novo no WindowsApps | `Microsoft.PowerShell_2026.716.1853.0_neutral_~_8wekyb3d8bbwe` (indica update recente) |
| `C:\Program Files\PowerShell\7\pwsh.exe` | não existe (só MSIX) |
| Envio de hoje | `sent_20260813.flag` 08:32:47, Resend ID `b10007b9-91d0-40f1-8643-e80e9a74e9ba` |

## Achados

### P1-001 — Alias do pwsh quebrado após update do pacote MSIX (corrigido com camada temporária)

`Resolve-PwshExe` falhou porque `Get-Command pwsh` no powershell.exe 5.1 (host da task) só alcança o alias de 0 byte; a resolução interativa funciona porque o pwsh 7 adiciona o próprio diretório ao PATH do processo.

Correção aplicada (2a): diretório versionado do MSIX adicionado à frente do PATH do usuário (`HKCU:\Environment`). Validação com processo novo de 5.1: `Get-Command pwsh` retorna `C:\Program Files\WindowsApps\Microsoft.PowerShell_7.6.4.0_x64__8wekyb3d8bbwe\pwsh.exe` (301368 bytes).

Limitação declarada: quebra de novo no próximo update do pacote. Correção definitiva (2b) é instalar o MSI em `C:\Program Files\PowerShell\7`, candidato nº 2 do launcher. Pendente de elevação.

### P1-002 — Caminho com espaço quebrava toda chamada de processo (corrigido)

`launcher_briefing.ps1` passava `-File $MainScript` e `run_briefing.ps1` passava `@($script) + $args` para `Start-Process -ArgumentList`, que junta o array com espaços sem aspas. O caminho `Morning Call` virava dois argumentos e o Python recebia `E:\...\Morning` truncado (exit 2 em todos os passos). Correção: aspas duplas em cada argumento, nos dois arquivos. Parse 5.1 e pwsh 7 confirmados.

### P1-003 — Parâmetro `$args` engolia o argumento do validador (corrigido)

`Run-Python` declarava parâmetro chamado `$args`, que é variável automática do PowerShell. O caminho do HTML nunca chegava ao `validar_briefing.py`, que imprimia usage e reprovava o envio. Renomeado para `$extraArgs`.

### P2-001 — URL inventada pelo modelo, bloqueada pelo portão

O gerador citou `https://www.congressonacional.leg.br/sessoes/agenda-do-congresso-senado-e-camara/-/agenda/2026-08-13` num item de agenda, fora do pool de notícias e malformada (`([url](url))`). REGRA 1 reprovou o envio. A URL foi removida mantendo o texto do item; o validador aprovou e o envio seguiu. O portão funcionou como desenhado.

### P0 pendente (herdado de ontem) — Task do fechamento das 19h com aspas escapadas

`Szuchmacher-FechamentoDiario` segue com `-File \"...\"` desde 11/08 22:02, morre em 1s com 0xFFFD0000. Vai falhar de novo hoje às 19h se o `corrigir-agendamento-ADMIN.ps1` não rodar elevado. A execução elevada foi negada pelo classificador de segurança da sessão; decisão com o Yan em aberto.

## Verificado sem achado

- Watchdog do briefing alertou corretamente às 07:20 e de novo não mente.
- OpenRouter com crédito: `google/gemma-3-27b-it:online` respondeu (4756 chars).
- Coleta de notícias: 55 itens com fonte BR (GDELT parcialmente rate-limitado, Finnhub sem token, ambos avisos conhecidos).
- Estado dos sistemas coletado: Radar Quant stale 2d, fallback Yahoo Finance 14/14 símbolos ativos.
- Sentinela `sent_20260813.flag` gravado após envio.
- Drift git em `briefing-interno`: os 2 scripts corrigidos hoje modificados, sem commit (sem deploy automático, regra do monorepo).

## Lacunas

- Não foi possível determinar o momento exato do update do pacote MSIX (não há log de Store acessível nesta sessão).
- Elevação pendente: instalação do MSI e correção das tasks do fechamento dependem de ação do Yan.
- Não houve verificação visual do e-mail recebido (cabe ao Yan confirmar a caixa).

## Próximos passos

1. Yan decide como aplicar a elevação: autorizar o prompt UAC ou rodar `powershell -NoProfile -ExecutionPolicy Bypass -File "E:\Diretorio\Claude\FREQUENTE\relatorio-diario-szuchmacher\diagnosticos\uac-fix-20260813.ps1"` como administrador.
2. Depois do MSI instalado, reverter a entrada do PATH adicionada hoje (fica redundante).
3. Amanhã 07h00: conferir que `briefing_20260814.log` começa com `LAUNCHER: Task Scheduler disparou` e que o `_py.log` termina em `ENVIADO OK`.
4. Hoje 19h00: conferir que `logs/briefing_20260813.log` do fechamento começa com `LAUNCHER:` (prova do fix da task).
