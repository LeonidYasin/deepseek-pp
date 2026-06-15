@echo off
setlocal enabledelayedexpansion

echo Fetching latest failed builds...
echo.

REM Get list of recent runs
gh run list --limit 10 --json databaseId,status,conclusion,name,displayTitle > runs.json

echo Recent builds:
echo.
type runs.json
echo.

REM Get failed runs
for /f "tokens=*" %%i in ('gh run list --limit 5 --status failure --json databaseId --jq ".[].databaseId"') do (
    echo.
    echo ========================================
    echo Checking run ID: %%i
    echo ========================================
    gh run view %%i --log 2>&1 | findstr /i "error fail exception"
    echo.
)

echo.
echo Done!
pause
