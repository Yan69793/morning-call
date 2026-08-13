# wakeup-briefing-ADMIN.ps1 — RODAR ELEVADO, uma vez so.
# Liga WakeToRun na task Szuchmacher-BriefingMatinal: a maquina acorda
# sozinha para o envio das 07h00, mesmo suspensa. Mantem todo o resto
# das configuracoes da task. ASCII puro. Log em logs/wakeup-briefing-20260813.log.

$ErrorActionPreference = 'Stop'

$log = 'E:\Diretorio\Claude\FREQUENTE\Morning Call\briefing-interno\logs\wakeup-briefing-20260813.log'
Start-Transcript -Path $log -Force

$tarefa = Get-ScheduledTask -TaskName 'Szuchmacher-BriefingMatinal'
$cfg = $tarefa.Settings
Write-Host "antes: WakeToRun=$($cfg.WakeToRun) | StartWhenAvailable=$($cfg.StartWhenAvailable)"
$cfg.WakeToRun = $true
Set-ScheduledTask -TaskName 'Szuchmacher-BriefingMatinal' -Settings $cfg | Out-Null

$depois = (Get-ScheduledTask -TaskName 'Szuchmacher-BriefingMatinal').Settings
Write-Host "depois: WakeToRun=$($depois.WakeToRun) | StartWhenAvailable=$($depois.StartWhenAvailable)"
Write-Host "LogonType: $($tarefa.Principal.LogonType)"

Stop-Transcript
