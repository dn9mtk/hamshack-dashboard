@echo off
REM Batch script to start both backend and frontend
echo 🚀 Starting HamShack Dashboard...
echo.

echo 📡 Starting backend server...
start "Backend Server" cmd /k "cd server && npm start"

timeout /t 2 /nobreak >nul

echo 💻 Starting frontend dev server...
start "Frontend Server" cmd /k "cd client && npm run dev"

echo.
echo ✅ Both servers are starting in separate windows...
echo Press any key to close this window (servers will continue running)
pause >nul
