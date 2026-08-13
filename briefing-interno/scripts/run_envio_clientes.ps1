# run_envio_clientes.ps1 — disparo unico das 10h00 do dia 14/08/2026.
# Envia o briefing aprovado do dia para a lista de clientes do Fechamento
# de Mercado, em BCC real. Sem o flag de aprovacao em
# logs/aprovacao_clientes_<data>.flag, NADA sai (falha fechada).
# A task se auto-remove ao terminar, com ou sem envio.
# ASCII puro: roda via powershell.exe (Windows PowerShell 5.1) no Task Scheduler.

$ErrorActionPreference = 'Continue'
$ProjectRoot = 'E:\Diretorio\Claude\FREQUENTE\Morning Call\briefing-interno'
$DateTag = Get-Date -Format 'yyyyMMdd'
$LogFile = Join-Path $ProjectRoot "logs\briefing_$DateTag.log"
$FlagAprovacao = Join-Path $ProjectRoot "logs\aprovacao_clientes_$DateTag.flag"
$HtmlDoDia = Join-Path $ProjectRoot "outputs\briefing_$DateTag.html"

$line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') CLIENTES: Task Scheduler disparou"
Add-Content -Path $LogFile -Value $line -Encoding UTF8

if (-not (Test-Path $FlagAprovacao)) {
    $msg = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') CLIENTES: SEM APROVACAO, envio nao realizado"
    Add-Content -Path $LogFile -Value $msg -Encoding UTF8
    Unregister-ScheduledTask -TaskName 'Szuchmacher-EnvioClientes' -Confirm:$false
    return 0
}

if (-not (Test-Path $HtmlDoDia)) {
    $msg = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') CLIENTES: HTML do dia nao encontrado, envio nao realizado"
    Add-Content -Path $LogFile -Value $msg -Encoding UTF8
    Unregister-ScheduledTask -TaskName 'Szuchmacher-EnvioClientes' -Confirm:$false
    return 1
}

python "$ProjectRoot\scripts\enviar_briefing.py" $HtmlDoDia --clientes *>> $LogFile
$code = $LASTEXITCODE
$msg = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') CLIENTES: enviar_briefing exit $code"
Add-Content -Path $LogFile -Value $msg -Encoding UTF8

Unregister-ScheduledTask -TaskName 'Szuchmacher-EnvioClientes' -Confirm:$false
return $code
