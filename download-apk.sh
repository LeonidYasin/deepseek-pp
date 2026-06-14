#!/bin/bash

# Download latest DeepSeek++ APK from GitHub Actions
# Usage: ./download-apk.sh

set -e

echo "🔍 Checking GitHub CLI..."
if ! command -v gh &> /dev/null; then
    echo "❌ GitHub CLI not found. Install from: https://cli.github.com/"
    exit 1
fi

echo "🔐 Checking authentication..."
if ! gh auth status &> /dev/null; then
    echo "❌ Not logged in. Run: gh auth login"
    exit 1
fi

echo "📦 Fetching latest successful workflow run..."
RUN_ID=$(gh run list --limit 5 --status success --json databaseId,displayTitle --jq '.[0].databaseId' 2>/dev/null)

if [ -z "$RUN_ID" ]; then
    echo "❌ No successful builds found"
    echo "Check Actions: https://github.com/LeonidYasin/deepseek-pp/actions"
    exit 1
fi

echo "✅ Found run ID: $RUN_ID"

echo "📥 Downloading artifacts..."
gh run download "$RUN_ID" -n deepseek-android-apk -D ./downloads

if [ -f "./downloads/deepseek-android-apk.zip" ]; then
    echo "✅ APK downloaded successfully!"
    echo "📁 Location: ./downloads/deepseek-android-apk.zip"
    echo ""
    echo "📋 Contents:"
    unzip -l ./downloads/deepseek-android-apk.zip
else
    echo "❌ APK file not found in artifacts"
    exit 1
fi
