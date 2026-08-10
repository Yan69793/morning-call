# registrar-tarefa.ps1: registra as tasks do Briefing Matinal no Task Scheduler.
#
# Duas tasks:
#   Szuchmacher-BriefingMatinal — 07h00, dias uteis, executa launcher_briefing.ps1
#   Szuchmacher-BriefingWatchdog — 07h20, dias uteis, executa watchdog_briefing.ps1
#
# Uso: pwsh -File registrar-tarefa.ps1
# O registro so acontece com confirmacao explicita.

$ErrorActionPreference = 'Continue'
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$ScriptDir = Join-Path $ProjectRoot 'scripts'
$LauncherPath = Join-Path $ScriptDir 'launcher_briefing.ps1'
$WatchdogPath = Join-Path $ScriptDir 'watchdog_briefing.ps1'
$PowershellExe = 'C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe'

# ============================================================
# Pre-flight: validar que os .ps1 parseiam no 5.1
# ============================================================
Write-Host "=== Pre-flight: validando parse no PowerShell 5.1 ==="

$launcherContent = Get-Content $LauncherPath -Raw
try {
    [System.Management.Automation.PSParser]::Tokenize($launcherContent, [ref]$null) | Out-Null
    Write-Host "OK: launcher_briefing.ps1 parseia sem erro"
} catch {
    Write-Host "ERRO: launcher_briefing.ps1 NAO parseia no 5.1: $($_.Exception.Message)"
    Write-Host "ABORTANDO. Corrija o arquivo antes de registrar."
    exit 1
}

# ============================================================
# Registrar task do briefing
# ============================================================
$taskName = 'Szuchmacher-BriefingMatinal'
Write-Host "`n=== Registrando task: $taskName ==="

$action = New-ScheduledTaskAction -Execute $PowershellExe `
    -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$LauncherPath`""

$trigger = New-ScheduledTaskTrigger -Daily -At 07:00
$trigger.DaysInterval = 1

$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -RunOnlyIfNetworkAvailable `
    -MultipleInstances IgnoreNew

$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" `
    -LogonType Interactive `
    -RunLevel Limited

try {
    Register-ScheduledTask -TaskName $taskName `
        -Action $action `
        -Trigger $trigger `
        -Settings $settings `
        -Principal $principal `
        -Description 'Briefing Matinal — 07h00 dias uteis. Pipeline: coleta noticias -> estado -> gera -> valida -> envia.' `
        -Force
    Write-Host "OK: task $taskName registrada (07h00, diario)"
} catch {
    Write-Host "ERRO ao registrar $taskName : $($_.Exception.Message)"
}

# ============================================================
# Registrar task do watchdog
# ============================================================
$watchdogName = 'Szuchmacher-BriefingWatchdog'
Write-Host "`n=== Registrando task: $watchdogName ==="

$wdAction = New-ScheduledTaskAction -Execute $PowershellExe `
    -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$WatchdogPath`""

$wdTrigger = New-ScheduledTaskTrigger -Daily -At 07:20
$wdTrigger.DaysInterval = 1

try {
    Register-ScheduledTask -TaskName $watchdogName `
        -Action $wdAction `
        -Trigger $wdTrigger `
        -Settings $settings `
        -Principal $principal `
        -Description 'Briefing Matinal Watchdog — 07h20. Alerta se o briefing nao saiu.' `
        -Force
    Write-Host "OK: task $watchdogName registrada (07h20, diario)"
} catch {
    Write-Host "ERRO ao registrar $watchdogName : $($_.Exception.Message)"
}

Write-Host "`n=== Tasks registradas ==="
Get-ScheduledTask -TaskName 'Szuchmacher-Briefing*' | Format-Table TaskName, State, NextRunTime
