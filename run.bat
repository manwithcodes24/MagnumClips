@echo off
echo ========================================
echo   MagnumClips - Starting Dev Servers
echo ========================================
echo.

:: Start backend
echo [1/2] Starting FastAPI backend on http://localhost:8000
start "MagnumClips Backend" cmd /k "cd /d %~dp0backend && .venv\Scripts\activate && uvicorn main:app --reload --host 0.0.0.0 --port 8000"

:: Wait a moment for backend to start
timeout /t 2 /nobreak > nul

:: Start frontend
echo [2/2] Starting Next.js frontend on http://localhost:3000
start "MagnumClips Frontend" cmd /k "cd /d %~dp0frontend && npm run dev"

echo.
echo Both servers started! Open http://localhost:3000
echo.
pause
