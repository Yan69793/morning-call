# run_envio_clientes.ps1, disparo unico das 10h00 do dia 14/08/2026.
#
# SUPERSEDED em 02/09/2026: o envio a clientes passou a rodar dentro do
# proprio run_briefing.ps1 (PASSO 5.8), logo apos o envio padrao das 07h00,
# com aprovacao automatica quando a REGRA 6 aprova de primeira. Nenhuma
# tarefa do Agendador chama mais este script (Szuchmacher-EnvioClientes se
# autorremoveu em 19/08 e nao foi recriada); ele fica so como registro do
# desenho original de aprovacao manual em chat + tarefa avulsa das 10h. Nao
# recriar essa tarefa sem antes decidir voltar de proposito a esse desenho.
#
# Envia o briefing aprovado do dia para a lista de clientes do Fechamento
# de Mercado, em BCC real. Sem o flag de aprovacao em
# logs/aprovacao_clientes_<data>.flag, NADA sai (falha fechada).
# A task se auto-remove ao terminar, com ou sem envio.
# ASCII puro: roda via powershell.exe (Windows PowerShell 5.1) no Task Scheduler.

$ErrorActionPreference = 'Continue'
$ProjectRoot = Split-Path -Parent $PSScriptRoot
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
    exit 0
}

if (-not (Test-Path $HtmlDoDia)) {
    $msg = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') CLIENTES: HTML do dia nao encontrado, envio nao realizado"
    Add-Content -Path $LogFile -Value $msg -Encoding UTF8
    Unregister-ScheduledTask -TaskName 'Szuchmacher-EnvioClientes' -Confirm:$false
    exit 1
}

python "$ProjectRoot\scripts\enviar_briefing.py" "$HtmlDoDia" --clientes *>> $LogFile
$code = $LASTEXITCODE
$msg = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') CLIENTES: enviar_briefing exit $code"
Add-Content -Path $LogFile -Value $msg -Encoding UTF8

Unregister-ScheduledTask -TaskName 'Szuchmacher-EnvioClientes' -Confirm:$false
exit $code
