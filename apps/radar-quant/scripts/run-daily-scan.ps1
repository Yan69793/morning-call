# Orquestrador do scan diário do Radar Quant Brasil.
# Chamado pelo Task Scheduler do Windows, sem depender de Claude Code aberto.
#
# Passos: abre o TradingView Desktop com depuração remota -> coleta as barras
# de preço -> busca notícias (Finnhub) -> monta o scan e publica no worker.
#
# Uso manual: pwsh -File run-daily-scan.ps1

$ErrorActionPreference = 'Continue'
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$logDir = Join-Path $scriptDir 'logs'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$logFile = Join-Path $logDir "scan-$(Get-Date -Format 'yyyy-MM-dd_HHmmss').log"

function Log($msg) {
    $line = "[$(Get-Date -Format 'HH:mm:ss')] $msg"
    Write-Host $line
    Add-Content -Path $logFile -Value $line
}

# ---- carregar .env (sem dependência externa) ----
$envFile = Join-Path $scriptDir '.env'
if (-not (Test-Path $envFile)) {
    Log "ERRO: $envFile não existe. Copie .env.example para .env e preencha os valores."
    exit 1
}
Get-Content $envFile | ForEach-Object {
    if ($_ -match '^\s*([^#=]+)\s*=\s*(.*)\s*$') {
        [Environment]::SetEnvironmentVariable($matches[1].Trim(), $matches[2].Trim(), 'Process')
    }
}

try {
    # ---- 1) abrir TradingView com CDP ----
    Log 'Encerrando instância existente do TradingView (se houver)...'
    Get-Process TradingView -ErrorAction SilentlyContinue | Stop-Process -Force
    Start-Sleep -Seconds 2

    $pkg = Get-AppxPackage -Name '*TradingView*' -ErrorAction SilentlyContinue
    if (-not $pkg) { throw 'TradingView não encontrado (Get-AppxPackage). Instale pelo Microsoft Store.' }
    $exe = Join-Path $pkg.InstallLocation 'TradingView.exe'
    if (-not (Test-Path $exe)) { throw "Executável não encontrado em: $exe" }

    Log 'Abrindo TradingView com depuração remota na porta 9222...'
    Start-Process $exe -ArgumentList '--remote-debugging-port=9222'

    # ---- 2) esperar CDP responder ----
    $ready = $false
    for ($i = 0; $i -lt 30; $i++) {
        Start-Sleep -Seconds 2
        try {
            $r = Invoke-WebRequest -Uri 'http://localhost:9222/json/list' -UseBasicParsing -TimeoutSec 3
            if ($r.StatusCode -eq 200 -and $r.Content -match 'tradingview') { $ready = $true; break }
        } catch {}
    }
    if (-not $ready) { throw 'TradingView não respondeu via CDP depois de 60s. Verifique se está logado.' }
    Log 'TradingView pronto e conectado via CDP.'

    Push-Location $scriptDir
    try {
        # ---- 3) coletar barras ----
        Log 'Coletando barras de preço...'
        npx tsx collect-bars.ts 2>&1 | Tee-Object -Variable collectOut | ForEach-Object { Add-Content -Path $logFile -Value $_ }
        if ($LASTEXITCODE -ne 0) { throw 'collect-bars.ts falhou — ver log acima.' }

        # ---- 4) buscar notícias ----
        Log 'Buscando notícias...'
        npx tsx fetch-news.ts 2>&1 | ForEach-Object { Add-Content -Path $logFile -Value $_ }
        if ($LASTEXITCODE -ne 0) { Log 'AVISO: fetch-news.ts falhou — o scan seguirá sem notícias.' }

        # ---- 5) montar e publicar ----
        Log 'Montando o scan e publicando...'
        npx tsx build-scan.ts 2>&1 | ForEach-Object { Add-Content -Path $logFile -Value $_ }
        if ($LASTEXITCODE -ne 0) { throw 'build-scan.ts falhou — ver log acima. Nada foi publicado ou a publicação foi rejeitada.' }
    } finally {
        Pop-Location
    }

    Log 'Scan diario concluido com sucesso.'
    # exit (nao return): e o unico jeito do processo powershell.exe devolver um
    # codigo que o Task Scheduler registra como LastTaskResult. Excecao
    # deliberada a regra geral do projeto, justificada pelo contrato deste
    # script especifico com o Task Scheduler.
    exit 0
} catch {
    Log "ERRO FATAL: $($_.Exception.Message)"
    exit 1
}
