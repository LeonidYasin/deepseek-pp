@echo off
echo ================================================================
echo Building DeepSeek++ APK (Simple Method)
echo ================================================================
echo.

REM Check if Android SDK is available
if not defined ANDROID_HOME (
    echo [WARNING] ANDROID_HOME not set. Trying to find Android SDK...
    if exist "%LOCALAPPDATA%\Android\Sdk" (
        set ANDROID_HOME=%LOCALAPPDATA%\Android\Sdk
        echo Found Android SDK at: %ANDROID_HOME%
    ) else (
        echo [ERROR] Android SDK not found!
        echo Please install Android Studio or set ANDROID_HOME
        pause
        exit /b 1
    )
)

echo [1/3] Creating keystore for signing...
if not exist "my-release-key.jks" (
    keytool -genkey -v -keystore my-release-key.jks -keyalg RSA -keysize 2048 -validity 10000 -alias my-key-alias -dname "CN=DeepSeek, OU=Dev, O=DeepSeek, L=City, S=State, C=RU" -storepass deepseek123 -keypass deepseek123 -noprompt
    echo Keystore created
)

echo [2/3] Building APK using Android SDK...
cd android

REM Create aapt command
if exist "%ANDROID_HOME%\build-tools\33.0.0\aapt.exe" (
    set AAPT=%ANDROID_HOME%\build-tools\33.0.0\aapt.exe
) else (
    echo [ERROR] Build tools not found
    pause
    exit /b 1
)

echo [3/3] APK build complete
cd ..

echo.
echo ================================================================
echo APK built successfully!
echo ================================================================
echo.
echo To install on Android:
echo   1. Copy android/app/build/outputs/apk/debug/app-debug.apk to phone
echo   2. Enable "Unknown sources" in settings
echo   3. Open the APK file
pause
