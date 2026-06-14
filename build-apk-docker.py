#!/usr/bin/env python3
"""
Docker-based APK Builder for DeepSeek++
Builds Android APK without requiring local Android SDK
"""

import os
import sys
import subprocess
import argparse
import zipfile
from pathlib import Path

REPO_ROOT = Path(__file__).parent.absolute()

def run_cmd(cmd, check=True):
    print(f"Running: {cmd}")
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    if check and result.returncode != 0:
        print(f"Error: {result.stderr}")
        sys.exit(1)
    return result.stdout, result.stderr

def build_apk_via_docker():
    """Build APK using Docker container with Android SDK"""
    print("Building APK via Docker...")
    
    # Create Dockerfile for Android build if not exists
    dockerfile = REPO_ROOT / "Dockerfile.android-builder"
    if not dockerfile.exists():
        dockerfile.write_text('''
FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y \\
    openjdk-17-jdk \\
    wget \\
    unzip \\
    git \\
    && rm -rf /var/lib/apt/lists/*

ENV ANDROID_SDK_ROOT=/opt/android-sdk
ENV PATH=$PATH:$ANDROID_SDK_ROOT/cmdline-tools/latest/bin:$ANDROID_SDK_ROOT/platform-tools

RUN mkdir -p $ANDROID_SDK_ROOT/cmdline-tools && \\
    wget -q https://dl.google.com/android/repository/commandlinetools-linux-9477386_latest.zip -O /tmp/cmdline-tools.zip && \\
    unzip /tmp/cmdline-tools.zip -d $ANDROID_SDK_ROOT/cmdline-tools/ && \\
    mv $ANDROID_SDK_ROOT/cmdline-tools/cmdline-tools $ANDROID_SDK_ROOT/cmdline-tools/latest && \\
    rm /tmp/cmdline-tools.zip

RUN yes | sdkmanager --licenses && \\
    sdkmanager "platforms;android-33" "build-tools;33.0.0" "platform-tools"

WORKDIR /app
COPY . .

RUN cd android && chmod +x gradlew && ./gradlew assembleDebug

CMD ["echo", "Build complete"]
''')
        print("Created Dockerfile.android-builder")
    
    # Build Docker image
    print("Building Docker image...")
    run_cmd(f"docker build -f Dockerfile.android-builder -t android-builder .")
    
    # Create container
    print("Creating container...")
    run_cmd(f"docker create --name apk-builder android-builder")
    
    # Start container
    print("Building APK...")
    run_cmd(f"docker start -a apk-builder")
    
    # Copy APK
    print("Copying APK...")
    os.makedirs("build/apk", exist_ok=True)
    run_cmd(f"docker cp apk-builder:/app/android/app/build/outputs/apk/debug/app-debug.apk ./build/apk/")
    
    # Cleanup
    print("Cleaning up...")
    run_cmd(f"docker rm apk-builder", check=False)
    
    apk_path = REPO_ROOT / "build/apk/app-debug.apk"
    if apk_path.exists():
        print(f"✅ APK built successfully: {apk_path}")
        print(f"Size: {apk_path.stat().st_size / 1024 / 1024:.2f} MB")
        return apk_path
    else:
        print("❌ APK not found")
        return None

def download_from_actions():
    """Download APK from GitHub Actions"""
    print("Checking GitHub Actions...")
    
    try:
        # Get latest run
        stdout, _ = run_cmd("gh run list --limit 1 --status success --json databaseId --jq '.[0].databaseId'", check=False)
        run_id = stdout.strip()
        
        if run_id:
            print(f"Found run: {run_id}")
            os.makedirs("build/apk", exist_ok=True)
            run_cmd(f"gh run download {run_id} -n deepseek-android-apk -D ./build/apk")
            
            # Extract zip
            zip_files = list((REPO_ROOT / "build/apk").glob("*.zip"))
            if zip_files:
                with zipfile.ZipFile(zip_files[0], 'r') as zf:
                    zf.extractall(REPO_ROOT / "build/apk")
                
                apk_files = list((REPO_ROOT / "build/apk").glob("*.apk"))
                if apk_files:
                    return apk_files[0]
        return None
    except Exception as e:
        print(f"Error downloading from Actions: {e}")
        return None

def main():
    parser = argparse.ArgumentParser(description='Build APK using Docker or download from GitHub')
    parser.add_argument('--docker', action='store_true', help='Build using Docker')
    parser.add_argument('--download', action='store_true', help='Download from GitHub Actions')
    parser.add_argument('--auto', action='store_true', help='Auto: try download, then build via Docker')
    
    args = parser.parse_args()
    
    if len(sys.argv) == 1:
        parser.print_help()
        print("\nExamples:")
        print("  python build-apk-docker.py --auto       # Try download, then build")
        print("  python build-apk-docker.py --docker     # Build via Docker")
        print("  python build-apk-docker.py --download   # Download from Actions")
        return
    
    apk_path = None
    
    if args.download or args.auto:
        apk_path = download_from_actions()
        if apk_path:
            print(f"✅ Downloaded APK: {apk_path}")
    
    if not apk_path and (args.docker or args.auto):
        apk_path = build_apk_via_docker()
    
    if apk_path:
        print(f"\n{'='*50}")
        print(f"APK ready: {apk_path}")
        print(f"{'='*50}")
    else:
        print("❌ Failed to obtain APK")

if __name__ == "__main__":
    main()
