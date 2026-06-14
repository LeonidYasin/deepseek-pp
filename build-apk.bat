@echo off
echo ================================================================
echo Building DeepSeek++ Android APK
echo ================================================================
echo.

REM Check if Docker is installed
docker --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Docker not found! Please install Docker Desktop
    pause
    exit /b 1
)

echo [1/4] Building Docker image...
docker build -f android/Dockerfile.local -t android-builder .
if errorlevel 1 (
    echo [ERROR] Failed to build Docker image
    pause
    exit /b 1
)

echo [2/4] Creating container...
docker create --name apk-builder android-builder

echo [3/4] Building APK...
docker start -a apk-builder

echo [4/4] Copying APK from container...
docker cp apk-builder:/app/android/app/build/outputs/apk/release ./apk-output

echo.
echo Cleaning up...
docker rm apk-builder

echo.
echo ================================================================
echo APK built successfully!
echo Location: %CD%\apk-output\
echo ================================================================
echo.
pause
