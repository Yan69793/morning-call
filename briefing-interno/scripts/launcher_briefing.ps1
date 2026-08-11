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

# PWSHALIAS1 (2026-08-11): o caminho era fixo em
# "$env:LOCALAPPDATA\Microsoft\WindowsApps\pwsh.exe", que nao e o executavel e
# sim o alias de execucao da Store, um arquivo de 0 byte. Test-Path aprova,
# Start-Process falha, e a tarefa reportava exit 64 sem que run_briefing.ps1
# chegasse a comecar: em 10 e 11/08 nenhum briefing_*_py.log foi criado, so as
# linhas do proprio launcher. Agora resolve por lista de candidatos e rejeita
# qualquer caminho de 0 byte, que e a assinatura do alias.
# Medido em 11/08 no powershell.exe 5.1, que e o host do Task Scheduler:
#   Get-Command pwsh -> C:\Program Files\WindowsApps\Microsoft.PowerShell_7.6.4.0_x64__8wekyb3d8bbwe\pwsh.exe (301368 bytes)
#   alias da Store   -> 0 bytes
#   listar C:\Program Files\WindowsApps -> 0 itens (bloqueado por ACL, nao da pra enumerar)
function Resolve-PwshExe {
    $cands = @()
    $g = Get-Command pwsh -ErrorAction SilentlyContinue
    if ($g -and $g.Source) { $cands += $g.Source }
    $cands += (Join-Path $env:ProgramFiles 'PowerShell\7\pwsh.exe')
    $cands += (Join-Path $env:ProgramFiles 'PowerShell\6\pwsh.exe')
    $cands += "$env:LOCALAPPDATA\Microsoft\WindowsApps\pwsh.exe"
    foreach ($c in $cands) {
        if (-not $c) { continue }
        if (-not (Test-Path -LiteralPath $c)) { continue }
        $item = Get-Item -LiteralPath $c -ErrorAction SilentlyContinue
        if (-not $item) { continue }
        if ($item.Length -le 0) { continue }
        return $c
    }
    return $null
}
$PwshExe = Resolve-PwshExe

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

if (-not $PwshExe) {
    $msg = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') LAUNCHER: ERRO nenhum pwsh.exe executavel encontrado. O alias da Store em %LOCALAPPDATA%\Microsoft\WindowsApps tem 0 byte e nao conta (PWSHALIAS1). Instale o PowerShell 7 em Program Files ou garanta que 'pwsh' resolva no PATH da conta que roda a tarefa."
    Add-Content -Path $LogFile -Value $msg -Encoding UTF8
    Write-Host $msg
    exit 1
}

# Registrar qual binario foi escolhido. Sem esta linha, uma regressao para o
# alias de 0 byte volta a aparecer so como "exit 64" sem causa no log.
$pwshLine = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') LAUNCHER: pwsh resolvido em $PwshExe"
Add-Content -Path $LogFile -Value $pwshLine -Encoding UTF8
Write-Host $pwshLine

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
