@echo off
chcp 65001 > nul
set "PATH=%LOCALAPPDATA%\Programs\Git\cmd;%PATH%"
echo.
echo ========================================================
echo  🚀 [Terraformers Nano Exodus] GitHub 실시간 자동 동기화
echo ========================================================
echo.
echo [1/3] 변경된 모든 작업 파일 추적 중...
git add .
echo [2/3] 변경 사항 로컬 커밋 중...
git commit -m "update: %date% %time% 작업 내역 동기화"
echo [3/3] GitHub 원격 저장소로 업로드(Push) 중...
git push origin main
echo.
echo ========================================================
echo  ✅ GitHub에 성공적으로 동기화되었습니다!
echo  🌐 https://github.com/Jwono2000/nano_Terra
echo ========================================================
echo.
pause
