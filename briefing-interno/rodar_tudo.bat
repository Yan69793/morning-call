@echo off
cd /d "E:\Diretorio\Claude\Briefing Matinal"
echo ==========================================
echo  Briefing Matinal - Pipeline Completo
echo  %date% %time%
echo ==========================================
echo.
echo [1/4] Coletando noticias...
python scripts/coletar_noticias.py
if %errorlevel% neq 0 echo AVISO: coleta de noticias falhou
echo.
echo [2/4] Coletando estado dos sistemas...
python scripts/coletar_estado.py
if %errorlevel% neq 0 echo AVISO: coleta de estado falhou
echo.
echo [3/4] Gerando briefing...
python scripts/gerar_briefing.py --dry-run
if %errorlevel% neq 0 (
    echo ERRO: geracao do briefing falhou
    pause
    exit /b 1
)
echo.
echo [4/4] Validando briefing...
python scripts/validar_briefing.py outputs/briefing_%date:~6,4%%date:~3,2%%date:~0,2%.html
if %errorlevel% neq 0 (
    echo REPROVADO: briefing nao passou no portao
) else (
    echo APROVADO: briefing validado com sucesso
)
echo.
echo ==========================================
echo  Pipeline concluido.
echo  Output: outputs\briefing_%date:~6,4%%date:~3,2%%date:~0,2%.html
echo  Log: logs\briefing_%date:~6,4%%date:~3,2%%date:~0,2%.log
echo ==========================================
pause
