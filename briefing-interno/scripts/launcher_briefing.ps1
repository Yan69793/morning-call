# launcher_briefing.ps1: envoltorio isolante para o Task Scheduler
#
# Motivo: mesmo padrao do launcher_fechamento.ps1 do Fechamento Diario.
# O Task Scheduler (powershell.exe 5.1) chama este arquivo, e este arquivo
# chama run_briefing.ps1 via pwsh.exe. Se o script principal tiver erro de
# parse, o launcher sobrevive e registra o fracasso.
#
# ASCII puro: roda via powershell.exe (Windows PowerShell 5.1) no Task Scheduler.

$ErrorActionPreference = 'Continue'
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$DateTag = Get-Date -Format 'yyyyMMdd'
$LogDir = Join-Path $ProjectRoot 'logs'
$LogFile = Join-Path $LogDir "briefing_$DateTag.log"
$MainScript = Join-Path $ProjectRoot 'scripts\run_briefing.ps1'
$PwshExe = "$env:LOCALAPPDATA\Microsoft\WindowsApps\pwsh.exe"

# Garantir que o diretorio de log existe ANTES de qualquer coisa
New-Item -ItemType Directory -Force -Path $LogDir -ErrorAction SilentlyContinue | Out-Null

# RASTRO IMEDIATO: esta linha precisa ser a primeira coisa que aparece no log.
$launcherLine = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') LAUNCHER: Task Scheduler disparou (PID $PID)"
Add-Content -Path $LogFile -Value $launcherLine -Encoding UTF8
Write-Host $launcherLine

if (-not (Test-Path $MainScript)) {
    $msg = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') LAUNCHER: ERRO script principal nao encontrado: $MainScript"
    Add-Content -Path $LogFile -Value $msg -Encoding UTF8
    Write-Host $msg
    exit 1
}

if (-not (Test-Path $PwshExe)) {
    $msg = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') LAUNCHER: ERRO pwsh.exe nao encontrado: $PwshExe"
    Add-Content -Path $LogFile -Value $msg -Encoding UTF8
    Write-Host $msg
    exit 1
}

# Executa o script principal como processo filho usando pwsh.exe.
$mainExit = 99
try {
    $proc = Start-Process -FilePath $PwshExe -ArgumentList @(
        '-NoProfile',
        '-ExecutionPolicy', 'Bypass',
        '-File', $MainScript
    ) -Wait -PassThru -NoNewWindow
    $mainExit = $proc.ExitCode
} catch {
    $mainExit = 98
    $errLine = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') LAUNCHER: excecao ao invocar script principal: $($_.Exception.Message)"
    Add-Content -Path $LogFile -Value $errLine -Encoding UTF8
    Write-Host $errLine
}

$exitLine = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') LAUNCHER: script principal exit $mainExit"
Add-Content -Path $LogFile -Value $exitLine -Encoding UTF8
Write-Host $exitLine
exit $mainExit
