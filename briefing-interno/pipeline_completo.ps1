# pipeline_completo.ps1 — Briefing Matinal: gerar, validar, enviar
# Uso: pwsh -File pipeline_completo.ps1
$ErrorActionPreference = 'Continue'
$ProjectRoot = $PSScriptRoot
Set-Location $ProjectRoot

Write-Host "=== Briefing Matinal - Pipeline Completo ===" -ForegroundColor Cyan
Write-Host ""

# 1. Noticias
Write-Host "[1/5] Coletando noticias..." -ForegroundColor Yellow
python scripts/coletar_noticias.py
if ($LASTEXITCODE -ne 0) { Write-Host "AVISO: coleta de noticias falhou" -ForegroundColor Magenta }
Write-Host ""

# 2. Estado
Write-Host "[2/5] Coletando estado dos sistemas..." -ForegroundColor Yellow
python scripts/coletar_estado.py
if ($LASTEXITCODE -ne 0) { Write-Host "AVISO: coleta de estado falhou" -ForegroundColor Magenta }
Write-Host ""

# 3. Gerar
Write-Host "[3/5] Gerando briefing (OpenRouter)..." -ForegroundColor Yellow
python scripts/gerar_briefing.py --dry-run
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERRO FATAL: geracao do briefing falhou" -ForegroundColor Red
    exit 1
}
Write-Host ""

# 4. Validar
$dateTag = Get-Date -Format 'yyyyMMdd'
$briefingPath = Join-Path $ProjectRoot "outputs" "briefing_${dateTag}.html"
Write-Host "[4/5] Validando briefing..." -ForegroundColor Yellow
python scripts/validar_briefing.py $briefingPath
if ($LASTEXITCODE -ne 0) {
    Write-Host "REPROVADO: briefing nao passou no portao. Corrija antes de enviar." -ForegroundColor Red
    exit 1
}
Write-Host "APROVADO" -ForegroundColor Green
Write-Host ""

# 5. Enviar
Write-Host "[5/5] Enviando briefing..." -ForegroundColor Yellow
python scripts/enviar_briefing.py $briefingPath
if ($LASTEXITCODE -eq 0) {
    Write-Host "ENVIADO COM SUCESSO" -ForegroundColor Green
} else {
    Write-Host "ERRO no envio" -ForegroundColor Red
}

Write-Host ""
Write-Host "=== Pipeline concluido ===" -ForegroundColor Cyan
Write-Host "Output: $briefingPath"
Write-Host "Logs: logs\briefing_${dateTag}.log e logs\briefing_${dateTag}_py.log"
