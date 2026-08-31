@echo off
set "PATH=%LOCALAPPDATA%\Programs\Git\bin;%LOCALAPPDATA%\Programs\Git\cmd;%PATH%"
echo ========================================================
echo   [GitHub] 1-Time Web Browser Login
echo ========================================================
echo.
echo 브라우저 인증 창이 열리면 화면에 표시되는 일회용 코드를 입력해주세요.
echo.
gh auth login -w -p https -h github.com
gh auth setup-git
echo.
echo ========================================================
echo   로그인이 완료되었습니다! 이제 push.bat 을 실행해주세요.
echo ========================================================
pause
