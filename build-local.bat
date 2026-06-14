@echo off
echo ================================================================
echo Building DeepSeek++ Android APK (Local Gradle)
echo ================================================================
echo.

cd android

echo [1/2] Cleaning...
call gradlew clean

echo [2/2] Building APK...
call gradlew assembleRelease

echo.
echo APK location: android\app\build\outputs\apk\release\
echo.
pause
