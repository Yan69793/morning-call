# watchdog_briefing.ps1: verifica se o briefing do dia saiu.
#
# Chamado pelo Task Scheduler as 07h20, todo dia util.
# Se o briefing nao saiu, alerta o Yan via script Python de alerta.
# Nao gera conteudo, so observa e alerta.
#
# ASCII puro: roda via powershell.exe 5.1.

$ErrorActionPreference = 'Continue'
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$DateTag = Get-Date -Format 'yyyyMMdd'
$LogDir = Join-Path $ProjectRoot 'logs'
$LogFile = Join-Path $LogDir "briefing_$DateTag.log"
$Sentinel = Join-Path $LogDir "sent_$DateTag.flag"

$watchdogLine = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') WATCHDOG: verificando briefing $DateTag"
Write-Host $watchdogLine

# Verificar se e dia util (mesma logica do run_briefing.ps1)
$feriadosPath = Join-Path $ProjectRoot 'feriados-b3.json'
if (Test-Path $feriadosPath) {
    $feriados = Get-Content $feriadosPath -Raw -Encoding UTF8 | ConvertFrom-Json
    $hoje = Get-Date
    $diaSemana = $hoje.DayOfWeek.value__
    if ($diaSemana -eq 0 -or $diaSemana -eq 6) {
        Write-Host "WATCHDOG: fim de semana. Nada a verificar."
        exit 0
    }
    $hojeISO = $hoje.ToString('yyyy-MM-dd')
    $feriadoHoje = $feriados.feriados | Where-Object { $_.data -eq $hojeISO }
    if ($feriadoHoje) {
        Write-Host "WATCHDOG: feriado B3. Nada a verificar."
        exit 0
    }
}

# Verificar sentinela de envio
if (Test-Path $Sentinel) {
    Write-Host "WATCHDOG: sentinela encontrada. Briefing enviado."
    exit 0
}

# Verificar ENVIADO OK no log
$enviado = $false
if (Test-Path $LogFile) {
    $enviado = Select-String -Path $LogFile -Pattern 'ENVIADO OK' -Quiet
}
if ($enviado) {
    Write-Host "WATCHDOG: ENVIADO OK encontrado no log. Briefing enviado."
    exit 0
}

# Estado remoto: se o Remote (sz-briefing-remote) enviou ou esta processando,
# nao alertar. Exit 0 do --status = sent, exit 1 = processing.
$claimScript = Join-Path $ProjectRoot 'scripts\claim_remote.py'
if (Test-Path $claimScript) {
    $py = (Get-Command python -ErrorAction SilentlyContinue).Source
    if ($py) {
        & $py $claimScript --status $DateTag *> $null
        $remoteExit = $LASTEXITCODE
        if ($remoteExit -eq 0) {
            Write-Host "WATCHDOG: estado remoto = enviado. Nada a verificar."
            exit 0
        }
        if ($remoteExit -eq 1) {
            Write-Host "WATCHDOG: estado remoto = em andamento. Nada a verificar."
            exit 0
        }
    }
}

# Nada encontrado — alertar
$alertLine = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') WATCHDOG: ALERTA briefing $DateTag NAO foi enviado"
Write-Host $alertLine

# Tentar enviar alerta via Python (se existir)
$alertScript = Join-Path $ProjectRoot 'scripts\alertar.py'
if (Test-Path $alertScript) {
    $py = (Get-Command python -ErrorAction SilentlyContinue).Source
    if ($py) {
        & $py $alertScript "Briefing Matinal $DateTag nao foi enviado as 07h00. Verifique o log."
    }
}

# Registrar no log principal se existir
if (Test-Path $LogFile) {
    Add-Content -Path $LogFile -Value $alertLine -Encoding UTF8
}

exit 3
