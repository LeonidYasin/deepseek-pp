#!/bin/bash

echo "================================================"
echo "DeepSeek++ APK Builder for Linux/Mac"
echo "================================================"
echo

# Check if Python is installed
if ! command -v python3 &> /dev/null; then
    echo "[ERROR] Python not found!"
    exit 1
fi

echo "[1/2] Running APK builder..."
python3 build-apk.py "$@"

echo
echo "================================================"
echo "Done!"
echo "================================================"
