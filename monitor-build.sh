#!/bin/bash

echo "=========================================="
echo "Monitoring APK Build Status"
echo "=========================================="
echo

# Check if gh is installed
if ! command -v gh &> /dev/null; then
    echo "❌ GitHub CLI not installed"
    echo "Install: https://cli.github.com/"
    exit 1
fi

echo "🔄 Checking latest workflow runs..."

# Get latest runs
gh run list --limit 3 --json status,conclusion,databaseId,displayTitle,createdAt

echo
echo "📊 Detailed status of latest run:"
RUN_ID=$(gh run list --limit 1 --json databaseId --jq '.[0].databaseId')

if [ -n "$RUN_ID" ]; then
    echo "Run ID: $RUN_ID"
    gh run view $RUN_ID --json status,conclusion,steps
    
    echo
    echo "📦 Checking artifacts..."
    gh run view $RUN_ID --json artifacts
fi
