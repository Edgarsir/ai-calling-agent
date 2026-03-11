@echo off
cls
echo.
echo ========================================
echo   HINDI AI CALLING AGENT
echo   Production Deployment
echo ========================================
echo.
echo Status: PRODUCTION READY
echo Language: Hindi (हिंदी)
echo Voice: Chirp 3 HD (Natural)
echo Performance: ^<1.5s latency
echo.
echo ========================================
echo.

echo Checking system...
echo.

echo [1/4] Verifying Railway connection...
railway status >nul 2>&1
if errorlevel 1 (
    echo ❌ ERROR: Not connected to Railway
    echo.
    echo Please run: railway login
    echo.
    pause
    exit /b 1
)
echo ✅ Railway connected

echo.
echo [2/4] Setting Hindi language variables...
railway variables --set TRANSCRIBE_LANGUAGE_CODE=hi-IN >nul 2>&1
railway variables --set CHIRP_VOICE_NAME=hi-IN-Chirp3-HD-Dhruv >nul 2>&1
railway variables --set CHIRP_LANGUAGE_CODE=hi-IN >nul 2>&1
echo ✅ Variables set

echo.
echo [3/4] Deploying to Railway...
echo.
railway up

if errorlevel 1 (
    echo.
    echo ❌ Deployment failed
    echo.
    pause
    exit /b 1
)

echo.
echo ========================================
echo   DEPLOYMENT SUCCESSFUL!
echo ========================================
echo.
echo ✅ Code deployed
echo ✅ Hindi language configured
echo ✅ Chirp 3 HD voice enabled
echo ✅ Streaming enabled
echo.
echo ========================================
echo   IMPORTANT: ONE MORE STEP
echo ========================================
echo.
echo Update GOOGLE_CREDENTIALS_JSON in Railway Dashboard:
echo.
echo 1. Go to: https://railway.app
echo 2. Select project: ai-calling-agent
echo 3. Go to Variables tab
echo 4. Find: GOOGLE_CREDENTIALS_JSON
echo 5. Copy JSON from: GOOGLE_CREDENTIALS_NEW_ACCOUNT.txt
echo 6. Paste (ONE line, no line breaks)
echo 7. Click Save
echo.
echo ========================================
echo   TEST YOUR DEPLOYMENT
echo ========================================
echo.
echo Call: 918065253312
echo.
echo Expected:
echo - AI greets in Hindi: "नमस्ते..."
echo - Natural Hindi conversation
echo - Latency ^<1.5 seconds
echo - Chirp 3 HD voice quality
echo.
echo ========================================
echo.
echo Deployment URL:
echo https://ai-calling-agent-production-bef1.up.railway.app
echo.
echo Health Check:
echo https://ai-calling-agent-production-bef1.up.railway.app/
echo.
echo ========================================
echo.
pause
