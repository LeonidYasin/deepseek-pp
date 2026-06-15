@echo off
echo ================================================================
echo        Universal MCP Server Installer
echo ================================================================
echo.

docker --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Docker not found!
    pause
    exit /b 1
)

echo [1/3] Building Docker image...
docker build -f Dockerfile.universal -t mcp-universal-server .

echo [2/3] Starting container...
docker-compose -f docker-compose.universal.yml down 2>nul
docker-compose -f docker-compose.universal.yml up -d

echo [3/3] Checking server...
timeout /t 3 >nul
echo.
echo Server running at: http://localhost:3000/mcp
echo.
pause
