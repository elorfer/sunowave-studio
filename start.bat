@echo off
title SunoWave Studio Launcher
color 0b
echo ========================================================
echo         SunoWave Studio - Suno AI Music Downloader
echo ========================================================
echo.
echo Iniciando servidor local ultra-rapido...
echo.

cd /d "%~dp0"

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0server.ps1"

if %ERRORLEVEL% NEQ 0 (
    echo No se pudo iniciar el servidor PowerShell. Abriendo en navegador directamente...
    start "" "%~dp0index.html"
)

pause
