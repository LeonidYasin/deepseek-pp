@echo off
echo ================================================================
echo Building DeepSeek++ Android APK Locally
echo ================================================================
echo.

cd android

echo [1/4] Cleaning old builds...
call gradlew clean
if errorlevel 1 (
    echo Failed to clean
    pause
    exit /b 1
)

echo [2/4] Building debug APK...
call gradlew assembleDebug
if errorlevel 1 (
    echo Failed to build debug APK
    pause
    exit /b 1
)

echo [3/4] Building release APK...
call gradlew assembleRelease
if errorlevel 1 (
    echo Failed to build release APK
    pause
    exit /b 1
)

echo [4/4] APK built successfully!
echo.
echo Debug APK: app/build/outputs/apk/debug/app-debug.apk
echo Release APK: app/build/outputs/apk/release/app-release.apk
echo.
cd ..
pause
