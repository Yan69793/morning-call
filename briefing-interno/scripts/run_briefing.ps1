# run_briefing.ps1: orquestrador do Briefing Matinal
#
# Chamado pelo launcher_briefing.ps1 via Task Scheduler.
# ASCII puro com BOM — roda no pwsh.exe (PowerShell 7).
# $ErrorActionPreference = 'Continue' — regra global do Yan.
#
# Fluxo: decide dia util -> coleta noticias -> coleta estado ->
#        gera briefing -> valida -> envia (se aprovado).

$ErrorActionPreference = 'Continue'
$ScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptRoot
$DateTag = Get-Date -Format 'yyyyMMdd'
$LogDir = Join-Path $ProjectRoot 'logs'
$LogFile = Join-Path $LogDir "briefing_${DateTag}_py.log"

# Garantir diretorio de log
New-Item -ItemType Directory -Force -Path $LogDir -ErrorAction SilentlyContinue | Out-Null

function Log($msg) {
    $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $msg"
    Write-Host $line
    Add-Content -Path $LogFile -Value $line -Encoding UTF8
}

function Run-Python($script, $extraArgs = @()) {
    $py = (Get-Command python -ErrorAction SilentlyContinue).Source
    if (-not $py) { $py = (Get-Command python3 -ErrorAction SilentlyContinue).Source }
    if (-not $py) {
        Log "ERRO: python nao encontrado no PATH"
        return 99
    }

    # O parametro nao pode se chamar $args: $args e a variavel automatica do
    # PowerShell para argumentos posicionais nao vinculados, e o segundo
    # argumento da chamada nunca chegava aqui. Em 13/08 o validador rodou sem
    # o caminho do HTML e o portao reprovou o envio por isso.
    if (-not $extraArgs) { $extraArgs = @() }

    $cmdArgs = @($script) + $extraArgs
    # Caminhos com espaco ("Morning Call") quebram na juncao de array do
    # Start-Process -ArgumentList: o caminho vira dois argumentos e o python
    # recebe um path truncado. Cada argumento vai entre aspas duplas.
    $argString = ($cmdArgs | ForEach-Object { '"' + $_ + '"' }) -join ' '
    $proc = Start-Process -FilePath $py -ArgumentList $argString `
        -Wait -PassThru -NoNewWindow `
        -RedirectStandardOutput (Join-Path $LogDir "stdout_${DateTag}.tmp") `
        -RedirectStandardError (Join-Path $LogDir "stderr_${DateTag}.tmp")

    # Juntar saidas ao log
    $tmpOut = Join-Path $LogDir "stdout_${DateTag}.tmp"
    $tmpErr = Join-Path $LogDir "stderr_${DateTag}.tmp"
    if (Test-Path $tmpOut) {
        Get-Content $tmpOut | ForEach-Object { Add-Content -Path $LogFile -Value $_ -Encoding UTF8 }
    }
    if (Test-Path $tmpErr) {
        Get-Content $tmpErr | ForEach-Object { Add-Content -Path $LogFile -Value "STDERR: $_" -Encoding UTF8 }
    }

    return $proc.ExitCode
}

# ============================================================
# PASSO 0: decidir se e dia util
# ============================================================
$feriadosPath = Join-Path $ProjectRoot 'feriados-b3.json'
if (-not (Test-Path $feriadosPath)) {
    Log "ERRO: feriados-b3.json nao encontrado. Abortando."
    return 5
}

$feriados = Get-Content $feriadosPath -Raw -Encoding UTF8 | ConvertFrom-Json
$coberturaAte = $feriados.cobertura_ate
if ($coberturaAte -and $coberturaAte -lt $DateTag) {
    Log "ALERTA: cobertura de feriados expirou em $coberturaAte. Tratando como dia util (F08)."
}

$hoje = Get-Date
$diaSemana = $hoje.DayOfWeek.value__  # 0=Sunday
if ($diaSemana -eq 0 -or $diaSemana -eq 6) {
    Log "Fim de semana. Nada a fazer."
    return 0
}

$hojeISO = $hoje.ToString('yyyy-MM-dd')
$feriadoHoje = $feriados.feriados | Where-Object { $_.data -eq $hojeISO }
if ($feriadoHoje) {
    Log "Feriado B3: $($feriadoHoje.nome). Nada a fazer."
    return 0
}

Log "RUN: dia util confirmado ($hojeISO). Iniciando pipeline..."

# ============================================================
# PASSO 1: coletar noticias
# ============================================================
Log "PASSO 1: coletar_noticias.py"
$exitCode = Run-Python (Join-Path $ScriptRoot 'coletar_noticias.py')
Log "coletar_noticias.py exit $exitCode"
if ($exitCode -ne 0) {
    Log "AVISO: coletar_noticias.py falhou (exit $exitCode). Continuando com o que tiver."
}

# ============================================================
# PASSO 2: coletar estado
# ============================================================
Log "PASSO 2: coletar_estado.py"
$exitCode = Run-Python (Join-Path $ScriptRoot 'coletar_estado.py')
Log "coletar_estado.py exit $exitCode"
if ($exitCode -ne 0) {
    Log "AVISO: coletar_estado.py falhou (exit $exitCode). O briefing pode ficar incompleto."
}

# ============================================================
# PASSO 3: gerar briefing
# ============================================================
Log "PASSO 3: gerar_briefing.py"
$exitCode = Run-Python (Join-Path $ScriptRoot 'gerar_briefing.py')
Log "gerar_briefing.py exit $exitCode"
if ($exitCode -ne 0) {
    Log "ERRO FATAL: gerar_briefing.py falhou (exit $exitCode). Abortando."
    return $exitCode
}

# ============================================================
# PASSO 4: validar briefing
# ============================================================
Log "PASSO 4: validar_briefing.py"
$briefingPath = Join-Path $ProjectRoot "outputs" "briefing_${DateTag}.html"
if (-not (Test-Path $briefingPath)) {
    Log "ERRO FATAL: briefing nao encontrado: $briefingPath"
    return 6
}
$exitCode = Run-Python (Join-Path $ScriptRoot 'validar_briefing.py') @($briefingPath)
Log "validar_briefing.py exit $exitCode"
if ($exitCode -ne 0) {
    Log "REPROVADO: briefing nao passou no portao. Envio abortado."
    return $exitCode
}

# ============================================================
# PASSO 5: enviar briefing
# ============================================================
Log "PASSO 5: enviar_briefing.py"
$exitCode = Run-Python (Join-Path $ScriptRoot 'enviar_briefing.py') @($briefingPath)
Log "enviar_briefing.py exit $exitCode"
if ($exitCode -eq 0) {
    Log "ENVIADO OK: briefing matinal enviado com sucesso."
} else {
    Log "ERRO: envio falhou (exit $exitCode)."
}

return $exitCode
