@echo off
setlocal
cd /d "%~dp0"
echo ========================================================
echo   [Terraformers Nano Exodus] Local Game Server
echo ========================================================
echo.
echo [1] 로컬 웹 서버 시작 중: http://localhost:8080 ...
echo     - 맵 에디터에서 [저장] 시 stages/ 폴더에 JSON 자동 생성
echo     - stages/manifest.json 자동 실시간 동기화
echo     - 작업 완료 후 'push.bat'을 실행하면 깃허브에 자동 반영됩니다.
echo.
echo [*] 브라우저가 열리지 않으면 직접 주소창에 입력하세요:
echo     http://localhost:8080
echo.
echo 서버를 종료하려면 이 창에서 Ctrl+C를 누르세요.
echo ========================================================
echo.
start http://localhost:8080
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0server.ps1" -port 8080
if %errorlevel% neq 0 (
    echo.
    echo [주의] 8080 포트가 이미 사용 중이거나 오류가 발생했습니다.
    echo 작업 관리자에서 powershell 프로세스가 남아있는지 확인해 보세요.
)
pause

