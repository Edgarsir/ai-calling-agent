@echo off
echo ========================================
echo   Stopping old server and starting new one
echo ========================================
echo.

echo Killing process on port 3000...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3000') do (
    taskkill /F /PID %%a 2>nul
)

echo.
echo Starting full server with AWS Polly and Transcribe...
echo.

node server-full.js

pause
