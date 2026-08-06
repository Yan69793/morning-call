# Arquiva o Morning Call do dia em morning-calls/<AAAA-MM>/<AAAA-MM-DD>.md.
# Feito para o Task Scheduler do Windows, sem depender de Claude Code aberto.
#
# Uso manual: pwsh -File save-morning-call.ps1
#
# 'Continue' e nao 'Stop': com 'Stop', qualquer escrita em stderr de uma ferramenta
# encerra o script no meio e a tarefa agendada reporta sucesso sem ter feito nada.
$ErrorActionPreference = 'Continue'

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$appDir = Split-Path -Parent $scriptDir
$logDir = Join-Path $scriptDir 'logs'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$logFile = Join-Path $logDir ("save-morning-call-{0}.log" -f (Get-Date -Format 'yyyy-MM-dd'))

function Log([string]$msg) {
    $linha = "[{0}] {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $msg
    Write-Output $linha
    Add-Content -Path $logFile -Value $linha
}

try {
    Log 'Buscando o Morning Call mais recente.'
    Push-Location $appDir
    try {
        $saida = & npx tsx scripts/save-morning-call.ts @args 2>&1
        $codigo = $LASTEXITCODE
        foreach ($linha in $saida) { Log $linha }
    } finally {
        Pop-Location
    }

    if ($codigo -ne 0) {
        Log "FALHOU: tsx terminou com codigo $codigo."
        return 1
    }

    Log 'Arquivamento concluido.'
    return 0
} catch {
    Log "ERRO FATAL: $($_.Exception.Message)"
    return 1
}
