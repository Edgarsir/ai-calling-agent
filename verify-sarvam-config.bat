@echo off
echo ========================================
echo   VERIFY SARVAM AI CONFIGURATION
echo ========================================
echo.

echo Checking Railway environment variables...
echo.

echo 1. SARVAM_API_KEY:
railway variables get SARVAM_API_KEY
echo.

echo 2. SARVAM_VOICE_HINDI:
railway variables get SARVAM_VOICE_HINDI
echo.

echo 3. SARVAM_VOICE_ENGLISH:
railway variables get SARVAM_VOICE_ENGLISH
echo.

echo ========================================
echo   EXPECTED VALUES
echo ========================================
echo SARVAM_API_KEY: sk_uhdwcjtk_4mIP4m7soQrtAcXFcnaGHxg1
echo SARVAM_VOICE_HINDI: ritu
echo SARVAM_VOICE_ENGLISH: shubh
echo.

echo If any values are missing or incorrect, set them:
echo   railway variables set SARVAM_API_KEY=sk_uhdwcjtk_4mIP4m7soQrtAcXFcnaGHxg1
echo   railway variables set SARVAM_VOICE_HINDI=ritu
echo   railway variables set SARVAM_VOICE_ENGLISH=shubh
echo.

pause
