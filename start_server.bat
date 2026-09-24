@echo off
setlocal
cd /d "%~dp0"
echo ========================================================
echo   [Terraformers Nano Exodus] Local Game Server
echo ========================================================
echo.
echo Starting local web server at http://localhost:8080 ...
echo Press Ctrl+C in this window to stop the server.
echo.
start http://localhost:8080
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0server.ps1" -port 8080
pause
