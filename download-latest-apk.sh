#!/bin/bash

# Script to download the latest APK from GitHub Actions
# Usage: ./download-latest-apk.sh

set -e

echo "=========================================="
echo "Downloading Latest APK"
echo "=========================================="
echo

# Check GitHub CLI
if ! command -v gh &> /dev/null; then
    echo "❌ GitHub CLI not found"
    echo "Install: brew install gh (macOS) or apt install gh (Linux)"
    exit 1
fi

# Check authentication
if ! gh auth status &> /dev/null; then
    echo "❌ Not logged in to GitHub"
    echo "Run: gh auth login"
    exit 1
fi

echo "📡 Fetching latest successful workflow run..."

# Get the latest successful run
RUN_ID=$(gh run list --limit 5 --status success --json databaseId,displayTitle --jq '.[0].databaseId' 2>/dev/null)

if [ -z "$RUN_ID" ]; then
    echo "❌ No successful builds found"
    echo "Check: https://github.com/LeonidYasin/deepseek-pp/actions"
    exit 1
fi

echo "✅ Found run ID: $RUN_ID"
echo

# Get run info
echo "📋 Run details:"
gh run view $RUN_ID --json displayTitle,status,createdAt

echo
echo "📥 Downloading artifacts..."

# Create download directory
mkdir -p downloads

# Download artifacts
git clone https://github.com/LeonidYasin/deepseek-pp.git temp-repo 2>/dev/null || true
cd temp-repo
git pull origin main 2>/dev/null

# Download specific artifact
gh run download $RUN_ID --dir ../downloads
cd ..
rm -rf temp-repo

echo
echo "=========================================="
echo "✅ Download complete!"
echo "=========================================="
echo

if [ -f "downloads/deepseek-android-apk.zip" ]; then
    echo "📦 Found APK archive: downloads/deepseek-android-apk.zip"
    echo "📏 Size: $(du -h downloads/deepseek-android-apk.zip | cut -f1)"
    echo
    echo "Unzipping..."
    unzip -l downloads/deepseek-android-apk.zip
elif [ -f "downloads/deepseek-android-debug.zip" ]; then
    echo "📦 Found debug APK: downloads/deepseek-android-debug.zip"
    unzip -l downloads/deepseek-android-debug.zip
else
    echo "⚠️ No APK found in artifacts"
    echo "Artifacts in downloads: $(ls downloads/)"
fi

echo
echo "✨ To install on Android:"
echo "   1. Extract the APK from the zip file"
echo "   2. Copy to your phone"
echo "   3. Enable 'Unknown sources' in settings"
echo "   4. Install the APK"
