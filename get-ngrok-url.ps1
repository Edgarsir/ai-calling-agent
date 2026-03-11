# Get ngrok URL from API
try {
    $response = Invoke-RestMethod -Uri "http://localhost:4040/api/tunnels" -Method Get
    $publicUrl = $response.tunnels[0].public_url
    $wsUrl = $publicUrl.Replace("http://", "ws://").Replace("https://", "wss://")
    
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "  Your ngrok URLs" -ForegroundColor Cyan
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "HTTP URL:" -ForegroundColor Yellow
    Write-Host $publicUrl -ForegroundColor Green
    Write-Host ""
    Write-Host "WebSocket URL (for Smartflo):" -ForegroundColor Yellow
    Write-Host "$wsUrl/voice/stream" -ForegroundColor Green
    Write-Host ""
    Write-Host "API Dialplan URL:" -ForegroundColor Yellow
    Write-Host "$publicUrl/api/dialplan" -ForegroundColor Green
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Copy the WebSocket URL above to Smartflo!" -ForegroundColor Cyan
    
} catch {
    Write-Host "❌ ngrok is not running!" -ForegroundColor Red
    Write-Host ""
    Write-Host "Start ngrok first:" -ForegroundColor Yellow
    Write-Host "  ngrok http 3000" -ForegroundColor White
}
