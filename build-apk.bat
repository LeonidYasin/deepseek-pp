@echo off
echo ================================================
echo DeepSeek++ APK Builder for Windows
echo ================================================
echo.

REM Check if Python is installed
python --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python not found!
    echo Please install Python from https://python.org
    pause
    exit /b 1
)

echo [1/2] Running APK builder...
python build-apk.py %*

echo.
echo ================================================
echo Done!
echo ================================================
pause
