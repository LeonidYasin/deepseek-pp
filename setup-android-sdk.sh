#!/bin/bash
echo "Setting up Android SDK for Linux..."

# Download Android SDK command line tools
SDK_DIR="$HOME/android-sdk"
mkdir -p $SDK_DIR

cd $SDK_DIR
wget -q https://dl.google.com/android/repository/commandlinetools-linux-9477386_latest.zip
unzip -q commandlinetools-linux-9477386_latest.zip
mkdir -p cmdline-tools
mv tools cmdline-tools/latest

export ANDROID_SDK_ROOT=$SDK_DIR
export PATH=$PATH:$ANDROID_SDK_ROOT/cmdline-tools/latest/bin

# Accept licenses
yes | sdkmanager --licenses

# Install required packages
sdkmanager "platforms;android-33" "build-tools;33.0.0" "platform-tools"

echo "Android SDK installed at: $SDK_DIR"
echo "Add to ~/.bashrc: export ANDROID_SDK_ROOT=$SDK_DIR"
