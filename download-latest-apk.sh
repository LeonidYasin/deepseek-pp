#!/bin/bash

echo "🔍 Fetching latest successful build..."

# Get the latest successful run ID
RUN_ID=$(gh run list --limit 5 --status success --json databaseId --jq '.[0].databaseId')

if [ -z "$RUN_ID" ]; then
    echo "❌ No successful builds found"
    exit 1
fi

echo "✅ Found run ID: $RUN_ID"

# Download debug APK
echo "📥 Downloading debug APK..."
gh run download "$RUN_ID" -n deepseek-debug-apk --dir ./apk-downloads

if [ -f "./apk-downloads/deepseek-debug-apk.zip" ]; then
    echo "✅ Debug APK downloaded!"
    unzip -l ./apk-downloads/deepseek-debug-apk.zip
    echo ""
    echo "📱 To install on Android:"
    echo "   adb install ./apk-downloads/*.apk"
    echo "   Or copy to phone and install manually"
elif [ -f "./apk-downloads/*.apk" ]; then
    echo "✅ APK downloaded!"
    ls -la ./apk-downloads/*.apk
else
    echo "❌ APK not found yet. Build may still be in progress."
    echo "   Check status: https://github.com/LeonidYasin/deepseek-pp/actions"
fi
