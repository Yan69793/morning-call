# Verifica se shared/types.ts e frontend/src/types/index.ts estao em sincronia
# Ignora linhas de comentario no topo do index.ts (header de aviso)

$shared = Get-Content "$PSScriptRoot\..\shared\types.ts" -Raw
$local  = Get-Content "$PSScriptRoot\..\frontend\src\types\index.ts" -Raw

# Remove linhas de comentario do topo do arquivo local antes de comparar
$localStripped = $local -replace '(?m)^//[^\r\n]*[\r\n]+', '' -replace '(?m)^\s*[\r\n]+', ''
$sharedStripped = $shared -replace '(?m)^//[^\r\n]*[\r\n]+', '' -replace '(?m)^\s*[\r\n]+', ''

if ($sharedStripped.Trim() -eq $localStripped.Trim()) {
    Write-Host "Types in sync"
    exit 0
} else {
    Write-Host "ERRO: tipos divergiram"
    Write-Host "Sincronize copiando: cp shared/types.ts frontend/src/types/index.ts"
    exit 1
}
