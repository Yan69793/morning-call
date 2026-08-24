# register-scan-diario-task.ps1
# Cria a task RadarQuant-ScanDiario no Windows Task Scheduler.
# Roda em dias uteis (seg-sex) as 18:45 BRT, apos o fechamento da B3 -- mesmo
# horario com que a tarefa nasceu em 2026-07-16 (memoria_de_sessao/parte-08).
#
# Execute aponta pro powershell.exe puro (Windows PowerShell 5.1), NAO pro
# alias WindowsApps do pwsh que fix_task_scan_diario.ps1 (neste mesmo diretorio)
# usa. Aquele alias resolveu o 0x80070002 original em 07-21, mas a task sumiu
# do Task Scheduler de novo por volta de 07-24 (provavel reboot nao investigado,
# ver AI_OPERATING_SYSTEM/06_RISCOS_E_DIVIDAS_TECNICAS.md) e ficou 15 dias sem
# coletar sem que ninguem notasse. powershell.exe 5.1 e o padrao confirmado em
# 2026-08-06 nas tasks que seguem funcionando de verdade nesta maquina
# (VIXRadar-Coleta-Volatilidade, VIXRadar-Matinal, Szuchmacher-MacroCron,
# MorningCall-Arquivamento). fix_task_scan_diario.ps1 fica no repo como
# registro historico do primeiro incidente, nao como o caminho recomendado.
#
# Reversao: Unregister-ScheduledTask -TaskName 'RadarQuant-ScanDiario' -Confirm:$false
#
# Uso: powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\register-scan-diario-task.ps1"

$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$ScriptPath  = Join-Path $ProjectRoot 'scripts\run-daily-scan.ps1'
$WorkDir     = Join-Path $ProjectRoot 'scripts'

if (-not (Test-Path $ScriptPath)) { throw "Script nao encontrado: $ScriptPath" }

$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$ScriptPath`"" -WorkingDirectory $WorkDir
$trigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday,Tuesday,Wednesday,Thursday,Friday -At '18:45'
$principal = New-ScheduledTaskPrincipal -UserId 'User' -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 15)

$task = Register-ScheduledTask -TaskName 'RadarQuant-ScanDiario' -TaskPath '\' `
    -Action $action -Trigger $trigger `
    -Principal $principal -Settings $settings `
    -Description 'Radar Quant Brasil - scan diario (TradingView CDP + noticias -> D1 via /api/ingest/scan)' `
    -Force

Write-Output "Task registrada: $($task.TaskName)"
$info = Get-ScheduledTaskInfo -TaskName 'RadarQuant-ScanDiario'
Write-Output "Proxima execucao: $($info.NextRunTime)"
