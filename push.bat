@echo off
setlocal
cd /d "%~dp0"
set "PATH=%LOCALAPPDATA%\Programs\Git\bin;%LOCALAPPDATA%\Programs\Git\cmd;%ProgramFiles%\Git\bin;%ProgramFiles%\Git\cmd;%PATH%"

echo ========================================================
echo   [Terraformers Nano Exodus] GitHub Sync
echo ========================================================
echo.
echo [1/4] Updating stages manifest...
powershell -NoProfile -ExecutionPolicy Bypass -File "build_manifest.ps1"
echo.
echo [2/4] Checking changed files...
git add .
echo [3/4] Committing changes...
git commit -m "update: latest game build"
echo [4/4] Uploading to GitHub...
git push origin main
echo.
echo ========================================================
echo   [SUCCESS] GitHub upload completed successfully!
echo   https://github.com/Jwono2000/nano_Terra
echo ========================================================
echo.
pause
