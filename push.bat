@echo off
cd /d "D:\AI-Games\nano_Terra"
set "PATH=%LOCALAPPDATA%\Programs\Git\bin;%LOCALAPPDATA%\Programs\Git\cmd;%PATH%"

echo ========================================================
echo   [Terraformers Nano Exodus] GitHub 실시간 동기화
echo ========================================================
echo.
echo [1/3] 변경 파일 추적 중...
git add .
echo [2/3] 변경 사항 로컬 커밋 중...
git commit -m "update: latest game build"
echo [3/3] GitHub로 업로드 중...
git push origin main
echo.
echo ========================================================
echo   [완료] GitHub 업로드가 성공적으로 완료되었습니다!
echo   https://github.com/Jwono2000/nano_Terra
echo ========================================================
echo.
pause
