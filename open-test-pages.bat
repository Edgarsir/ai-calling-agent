@echo off
echo Opening test pages in your browser...
echo.

start http://localhost:3000/
timeout /t 1 /nobreak >nul

start http://localhost:3000/test
timeout /t 1 /nobreak >nul

start http://localhost:3000/test-websocket.html

echo.
echo ✅ Test pages opened!
echo.
pause
