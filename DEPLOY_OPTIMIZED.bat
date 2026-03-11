@echo off
echo ========================================
echo   DEPLOYING OPTIMIZED SERVER
echo ========================================
echo.
echo Optimizations Applied:
echo   - Ultra-aggressive chunking (2-4 words first)
echo   - Faster TTS pace (1.5)
echo   - Reduced tokens (60)
echo   - Confidence filtering
echo   - Anti-overlap protection
echo   - Response validation
echo.
echo Expected Performance:
echo   - Total latency: 500-650ms (was 700-800ms)
echo   - Perceived latency: less than 400ms
echo   - First audio: less than 300ms
echo.
echo ========================================
echo.

echo Deploying to Railway...
railway up

echo.
echo ========================================
echo   DEPLOYMENT COMPLETE!
echo ========================================
echo.
echo Next Steps:
echo   1. Monitor logs: railway logs --tail
echo   2. Test with a call
echo   3. Verify latency improvements
echo.
echo Look for these in logs:
echo   - "FIRST CHUNK (ultra-fast)"
echo   - Total latency less than 650ms
echo   - No overlap warnings
echo.
pause
