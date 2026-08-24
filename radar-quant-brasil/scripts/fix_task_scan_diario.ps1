<#
  SUPERADO em 2026-08-06: a task voltou a sumir do Task Scheduler por volta de
  07-24 (provavel reboot nao investigado, ver AI_OPERATING_SYSTEM/06), 15 dias
  sem coletar sem ninguem notar. Recriada apontando pro powershell.exe puro
  (Windows PowerShell 5.1), nao mais pro alias WindowsApps do pwsh que este
  script aplica abaixo. Caminho recomendado agora e
  register-scan-diario-task.ps1, neste mesmo diretorio. Este arquivo fica
  como registro historico do primeiro incidente (07-16 a 07-21), nao apague.

  Corrige a Action da tarefa RadarQuant-ScanDiario.

  CAUSA RAIZ (medida em 2026-07-21, nao presumida):
  A Action chama `pwsh.exe` pelo nome puro, sem caminho. O Task Scheduler nao
  resolve o App Execution Alias do PowerShell pelo PATH como um shell faz, entao
  toda execucao automatica morre com 0x80070002 (arquivo nao encontrado) antes
  da primeira linha do script.

  O DIAGNOSTICO ANTERIOR ESTAVA ERRADO. O registro dizia que a culpa era o
  PowerShell ser instalacao Microsoft Store/MSIX e que a solucao seria instalar
  o MSI oficial. Nao e. Prova na propria maquina: a tarefa
  VIXRadar-Coleta-Volatilidade aponta para o alias em WindowsApps e rodou com
  sucesso (LastResult 0x0) em 21/07 13:29. Store nao e o problema, nome puro e.

  POR QUE O ALIAS E NAO O CAMINHO DO PACOTE:
  A tarefa PME-Codex-Radar-Propostas aponta direto para
  `C:\Program Files\WindowsApps\Microsoft.PowerShell_7.6.2.0_x64__.../pwsh.exe`
  e falha com o mesmo 0x80070002 — porque a Store atualizou o PowerShell para
  7.6.3.0 e a pasta com a versao antiga deixou de existir. Fixar a versao no
  caminho quebra de novo a cada atualizacao. O alias em WindowsApps e estavel.

  Uso:
    pwsh -File "<este arquivo>"            # aplica
    pwsh -File "<este arquivo>" -DryRun    # so mostra o que faria

  A tarefa e RunLevel=Limited, entao nao deve exigir janela de administrador.
  Idempotente: se ja estiver correta, so reporta e sai.
#>
[CmdletBinding()]
param(
  [string]$TaskName = 'RadarQuant-ScanDiario',
  [switch]$DryRun
)

$ErrorActionPreference = 'Stop'

# Alias estavel, independente de versao do pacote. Confirmado funcionando nesta
# maquina pela VIXRadar-Coleta-Volatilidade.
$PwshAlias = Join-Path $env:LOCALAPPDATA 'Microsoft\WindowsApps\pwsh.exe'

if (-not (Test-Path $PwshAlias)) {
  Write-Host "ERRO: nao achei o pwsh em $PwshAlias" -ForegroundColor Red
  Write-Host "Sem esse alias nao ha caminho estavel para apontar. Verifique a instalacao do PowerShell 7." -ForegroundColor Red
  return
}

$task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if (-not $task) {
  Write-Host "ERRO: tarefa '$TaskName' nao existe." -ForegroundColor Red
  return
}

$exeAtual = $task.Actions[0].Execute
$argsAtual = $task.Actions[0].Arguments
Write-Host "Execute antes : $exeAtual"
Write-Host "Arguments     : $argsAtual"

if ($exeAtual -eq $PwshAlias) {
  Write-Host 'Ja aponta para o alias estavel. Nada a fazer.' -ForegroundColor Green
  return
}

# Backup do XML antes de mexer — rollback e reimportar este arquivo.
$bk = Join-Path $env:TEMP ("{0}_bk_{1}.xml" -f $TaskName, (Get-Date -Format 'yyyyMMdd-HHmmss'))
Export-ScheduledTask -TaskName $TaskName | Out-File $bk -Encoding utf8
Write-Host "Backup do XML : $bk" -ForegroundColor DarkGray

if ($DryRun) {
  Write-Host "[DryRun] Execute passaria a ser: $PwshAlias" -ForegroundColor Yellow
  Write-Host '[DryRun] Arguments seriam preservados como estao.' -ForegroundColor Yellow
  return
}

# Preserva os Arguments: o problema e so o executavel, o -File ja esta com
# aspas corretas nesta tarefa.
$novaAction = New-ScheduledTaskAction -Execute $PwshAlias -Argument $argsAtual
Set-ScheduledTask -TaskName $TaskName -Action $novaAction | Out-Null

$depois = (Get-ScheduledTask -TaskName $TaskName).Actions[0].Execute
Write-Host "Execute depois: $depois"
if ($depois -ne $PwshAlias) {
  Write-Host "FALHOU: Execute nao mudou. Restaure com: Register-ScheduledTask -Xml (Get-Content '$bk' -Raw) -TaskName '$TaskName' -Force" -ForegroundColor Red
  return
}
Write-Host 'OK: Action corrigida.' -ForegroundColor Green

# Validar de verdade: disparar e conferir o resultado. Sem isto so sabemos que
# o campo mudou, nao que a tarefa passou a executar.
Write-Host 'Disparando a tarefa uma vez para validar...'
Start-ScheduledTask -TaskName $TaskName
Start-Sleep -Seconds 10
$info = Get-ScheduledTaskInfo -TaskName $TaskName
$res = $info.LastTaskResult
Write-Host ("LastTaskResult: 0x{0:X}" -f $res)
if ($res -eq 0x80070002) {
  Write-Host 'AINDA 0x80070002. O executavel nao foi a unica causa — investigar o proprio script.' -ForegroundColor Red
} elseif ($res -eq 267009) {
  Write-Host 'Tarefa em execucao (0x41301). Confira o resultado daqui a alguns minutos.' -ForegroundColor Yellow
} elseif ($res -eq 0) {
  Write-Host 'Sucesso. Confirme o dado novo em /api/radar/latest antes de dar por encerrado.' -ForegroundColor Green
} else {
  Write-Host 'Resultado diferente de 0 — ver logs do proprio script.' -ForegroundColor Yellow
}
