
Write-Host "Finding process using port 3000..." -ForegroundColor Cyan

$port = 3000
$process = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique

if ($process) {
    Write-Host "Found process: $process" -ForegroundColor Yellow
    Write-Host "Killing process..." -ForegroundColor Yellow
    Stop-Process -Id $process -Force
    Write-Host "✅ Process killed!" -ForegroundColor Green
    Start-Sleep -Seconds 1
} else {
    Write-Host "No process found using port 3000" -ForegroundColor Green
}

Write-Host ""
Write-Host "Starting server..." -ForegroundColor Cyan
node server-simple.js
