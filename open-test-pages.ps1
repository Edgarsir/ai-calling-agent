Write-Host "Opening test pages in your browser..." -ForegroundColor Cyan
Write-Host ""

Start-Process "http://localhost:3000/"
Start-Sleep -Seconds 1

Start-Process "http://localhost:3000/test"
Start-Sleep -Seconds 1

Start-Process "http://localhost:3000/test-websocket.html"

Write-Host ""
Write-Host "✅ Test pages opened!" -ForegroundColor Green
Write-Host ""
Write-Host "Press any key to exit..." -ForegroundColor Yellow
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
