@echo off
setlocal
cd /d "D:\AI-Games\nano_Terra"
set "PATH=%LOCALAPPDATA%\Programs\Git\bin;%LOCALAPPDATA%\Programs\Git\cmd;%ProgramFiles%\Git\bin;%ProgramFiles%\Git\cmd;%PATH%"

echo ========================================================
echo   [Terraformers Nano Exodus] GitHub Sync
echo ========================================================
echo.
echo [1/3] Checking changed files...
git add .
echo [2/3] Committing changes...
git commit -m "update: latest game build"
echo [3/3] Uploading to GitHub...
git push origin main
echo.
echo ========================================================
echo   [SUCCESS] GitHub upload completed successfully!
echo   https://github.com/Jwono2000/nano_Terra
echo ========================================================
echo.
pause
