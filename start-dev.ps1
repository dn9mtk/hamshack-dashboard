# PowerShell script to start both backend and frontend
Write-Host "🚀 Starting HamShack Dashboard...`n" -ForegroundColor Cyan

# Start backend in background
Write-Host "📡 Starting backend server..." -ForegroundColor Yellow
$backend = Start-Process -FilePath "npm" -ArgumentList "start" -WorkingDirectory "server" -PassThru -NoNewWindow

# Start frontend in background
Write-Host "💻 Starting frontend dev server...`n" -ForegroundColor Yellow
$frontend = Start-Process -FilePath "npm" -ArgumentList "run", "dev" -WorkingDirectory "client" -PassThru -NoNewWindow

Write-Host "✅ Both servers are starting..." -ForegroundColor Green
Write-Host "Press Ctrl+C to stop both servers`n" -ForegroundColor Gray

# Wait for Ctrl+C
try {
    while ($true) {
        Start-Sleep -Seconds 1
    }
}
finally {
    Write-Host "`n🛑 Shutting down servers..." -ForegroundColor Yellow
    Stop-Process -Id $backend.Id -Force -ErrorAction SilentlyContinue
    Stop-Process -Id $frontend.Id -Force -ErrorAction SilentlyContinue
    Write-Host "✅ Servers stopped" -ForegroundColor Green
}
