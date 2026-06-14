#!/bin/bash

echo "================================================================"
echo "Building DeepSeek++ Android APK"
echo "================================================================"
echo

if ! command -v docker &> /dev/null; then
    echo "[ERROR] Docker not found! Please install Docker"
    exit 1
fi

echo "[1/4] Building Docker image..."
docker build -f android/Dockerfile.local -t android-builder .
if [ $? -ne 0 ]; then
    echo "[ERROR] Failed to build Docker image"
    exit 1
fi

echo "[2/4] Creating container..."
docker create --name apk-builder android-builder

echo "[3/4] Building APK..."
docker start -a apk-builder

echo "[4/4] Copying APK from container..."
docker cp apk-builder:/app/android/app/build/outputs/apk/release ./apk-output

echo
echo "Cleaning up..."
docker rm apk-builder

echo
echo "================================================================"
echo "APK built successfully!"
echo "Location: $(pwd)/apk-output/"
echo "================================================================"
