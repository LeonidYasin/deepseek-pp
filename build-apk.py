#!/usr/bin/env python3
"""
APK Builder Script for DeepSeek++ Android App
Usage: python build-apk.py [--debug] [--download] [--install] [--device]
"""

import os
import sys
import subprocess
import argparse
import tempfile
import zipfile
import shutil
import json
import time
from pathlib import Path
from typing import Optional, Tuple

# Configuration
REPO_ROOT = Path(__file__).parent.absolute()
ANDROID_DIR = REPO_ROOT / "android"
BUILD_DIR = REPO_ROOT / "build"
APK_OUTPUT_DIR = BUILD_DIR / "apk"

class Colors:
    """Terminal colors"""
    HEADER = '\033[95m'
    OKBLUE = '\033[94m'
    OKCYAN = '\033[96m'
    OKGREEN = '\033[92m'
    WARNING = '\033[93m'
    FAIL = '\033[91m'
    ENDC = '\033[0m'
    BOLD = '\033[1m'


def print_step(msg: str):
    print(f"\n{Colors.OKCYAN}▶ {msg}{Colors.ENDC}")

def print_success(msg: str):
    print(f"{Colors.OKGREEN}✓ {msg}{Colors.ENDC}")

def print_error(msg: str):
    print(f"{Colors.FAIL}✗ {msg}{Colors.ENDC}")

def print_warning(msg: str):
    print(f"{Colors.WARNING}⚠ {msg}{Colors.ENDC}")

def run_cmd(cmd: list, cwd=None, check=True) -> Tuple[str, str]:
    """Run command and return stdout, stderr"""
    try:
        result = subprocess.run(
            cmd, 
            cwd=cwd, 
            capture_output=True, 
            text=True,
            shell=(sys.platform == "win32" and len(cmd) == 1)
        )
        if check and result.returncode != 0:
            print_error(f"Command failed: {' '.join(cmd)}")
            print(result.stderr)
            sys.exit(1)
        return result.stdout, result.stderr
    except FileNotFoundError as e:
        print_error(f"Command not found: {cmd[0]}")
        sys.exit(1)

def check_dependencies():
    """Check if required tools are installed"""
    print_step("Checking dependencies...")
    
    deps = []
    
    # Check Java
    try:
        stdout, _ = run_cmd(["java", "-version"], check=False)
        if "version" in stdout.lower():
            print_success("Java found")
            deps.append(True)
        else:
            print_error("Java not found")
            deps.append(False)
    except:
        print_error("Java not found")
        deps.append(False)
    
    # Check Gradle
    gradle_cmd = ["./gradlew" if sys.platform != "win32" else "gradlew.bat"]
    if (ANDROID_DIR / "gradlew").exists() or (ANDROID_DIR / "gradlew.bat").exists():
        print_success("Gradle wrapper found")
        deps.append(True)
    else:
        print_warning("Gradle wrapper not found, will try to use system gradle")
        deps.append(False)
    
    # Check Android SDK
    android_home = os.environ.get("ANDROID_HOME") or os.environ.get("ANDROID_SDK_ROOT")
    if android_home:
        print_success(f"Android SDK found at: {android_home}")
        deps.append(True)
    else:
        print_warning("ANDROID_HOME not set, will use gradle's automatic SDK download")
        deps.append(True)
    
    return all(deps)

def setup_project():
    """Setup Android project"""
    print_step("Setting up Android project...")
    
    # Create local.properties if not exists
    local_props = ANDROID_DIR / "local.properties"
    if not local_props.exists():
        android_home = os.environ.get("ANDROID_HOME") or os.environ.get("ANDROID_SDK_ROOT")
        if android_home:
            with open(local_props, "w") as f:
                f.write(f"sdk.dir={android_home.replace(chr(92), '/')}\n")
            print_success("Created local.properties")
    
    # Create keystore for debug builds if not exists
    keystore = Path.home() / ".android" / "debug.keystore"
    if not keystore.exists():
        print_warning("Debug keystore not found, will be created automatically by gradle")

def build_apk(build_type: str = "debug"):
    """Build APK using gradle"""
    print_step(f"Building {build_type.upper()} APK...")
    
    gradle_cmd = ["./gradlew" if sys.platform != "win32" else "gradlew.bat"]
    
    if build_type == "debug":
        task = "assembleDebug"
        output_path = ANDROID_DIR / "app/build/outputs/apk/debug/app-debug.apk"
    else:
        task = "assembleRelease"
        output_path = ANDROID_DIR / "app/build/outputs/apk/release/app-release.apk"
    
    # Clean previous build
    run_cmd(gradle_cmd + ["clean"], cwd=ANDROID_DIR, check=False)
    
    # Build
    stdout, stderr = run_cmd(gradle_cmd + [task], cwd=ANDROID_DIR)
    
    if output_path.exists():
        print_success(f"APK built: {output_path}")
        return output_path
    else:
        print_error(f"APK not found at {output_path}")
        return None

def download_from_github() -> Optional[Path]:
    """Download latest APK from GitHub Actions"""
    print_step("Downloading APK from GitHub Actions...")
    
    try:
        # Check if gh is installed
        stdout, _ = run_cmd(["gh", "--version"], check=False)
        
        # Get latest successful run
        stdout, _ = run_cmd(["gh", "run", "list", "--limit", "5", "--json", "databaseId,status", "--jq", 
                             '.[] | select(.status == "completed") | .databaseId'], cwd=REPO_ROOT)
        
        run_ids = stdout.strip().split('\n')
        if not run_ids or not run_ids[0]:
            print_error("No completed runs found")
            return None
        
        run_id = run_ids[0]
        print_step(f"Found run ID: {run_id}")
        
        # Download artifacts
        APK_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
        run_cmd(["gh", "run", "download", run_id, "-n", "deepseek-android-apk", "-D", str(APK_OUTPUT_DIR)], 
                cwd=REPO_ROOT)
        
        # Find zip file
        zip_files = list(APK_OUTPUT_DIR.glob("*.zip"))
        if zip_files:
            zip_path = zip_files[0]
            print_success(f"Downloaded: {zip_path}")
            
            # Extract APK
            with zipfile.ZipFile(zip_path, 'r') as zip_ref:
                zip_ref.extractall(APK_OUTPUT_DIR)
            
            apk_files = list(APK_OUTPUT_DIR.glob("*.apk"))
            if apk_files:
                return apk_files[0]
        
        return None
        
    except Exception as e:
        print_warning(f"GitHub CLI not available or error: {e}")
        print_warning("Falling back to local build...")
        return None

def install_apk(apk_path: Path, device: str = None):
    """Install APK on connected device"""
    print_step("Installing APK on device...")
    
    # Check adb
    try:
        stdout, _ = run_cmd(["adb", "devices"], check=False)
        if "device" not in stdout:
            print_error("No device connected")
            return False
    except:
        print_error("ADB not found")
        return False
    
    # Install
    cmd = ["adb", "install", "-r", str(apk_path)]
    if device:
        cmd = ["adb", "-s", device, "install", "-r", str(apk_path)]
    
    stdout, stderr = run_cmd(cmd)
    if "Success" in stdout:
        print_success("APK installed successfully")
        return True
    else:
        print_error(f"Installation failed: {stderr}")
        return False

def run_tests():
    """Run Android tests"""
    print_step("Running tests...")
    
    gradle_cmd = ["./gradlew" if sys.platform != "win32" else "gradlew.bat"]
    stdout, stderr = run_cmd(gradle_cmd + ["test"], cwd=ANDROID_DIR, check=False)
    
    if "BUILD SUCCESSFUL" in stdout:
        print_success("Tests passed")
        return True
    else:
        print_warning("Tests failed or not configured")
        return False

def setup_adb_forward():
    """Setup ADB forward for MCP server"""
    print_step("Setting up ADB port forwarding...")
    
    try:
        # Forward MCP server port
        run_cmd(["adb", "forward", "tcp:3000", "tcp:3000"], check=False)
        print_success("ADB forward configured: localhost:3000 -> device:3000")
        return True
    except:
        print_warning("ADB forward setup failed")
        return False

def main():
    parser = argparse.ArgumentParser(description='Build, debug and install DeepSeek++ APK')
    parser.add_argument('--debug', action='store_true', help='Build debug APK')
    parser.add_argument('--release', action='store_true', help='Build release APK')
    parser.add_argument('--download', action='store_true', help='Download APK from GitHub Actions')
    parser.add_argument('--install', action='store_true', help='Install APK on connected device')
    parser.add_argument('--device', help='Device serial for installation')
    parser.add_argument('--test', action='store_true', help='Run tests')
    parser.add_argument('--forward', action='store_true', help='Setup ADB port forwarding')
    parser.add_argument('--all', action='store_true', help='Build, install and setup everything')
    
    args = parser.parse_args()
    
    print(f"{Colors.HEADER}")
    print("╔════════════════════════════════════════════════╗")
    print("║        DeepSeek++ APK Builder v1.0            ║")
    print("║        Build, Debug & Install Tool            ║")
    print("╚════════════════════════════════════════════════╝")
    print(f"{Colors.ENDC}")
    
    # If no arguments, show help
    if len(sys.argv) == 1:
        parser.print_help()
        print("\nExamples:")
        print("  python build-apk.py --debug --install      # Build and install debug APK")
        print("  python build-apk.py --download --install   # Download and install from GitHub")
        print("  python build-apk.py --all                  # Full build, test, install, setup")
        return
    
    apk_path = None
    
    # Download from GitHub
    if args.download or args.all:
        apk_path = download_from_github()
        if not apk_path:
            print_warning("Download failed, will try local build")
            args.debug = True
    
    # Build locally
    if args.debug or args.release or (args.all and not apk_path):
        if check_dependencies():
            setup_project()
            build_type = "release" if args.release else "debug"
            
            if args.test or args.all:
                run_tests()
            
            apk_path = build_apk(build_type)
    
    # Setup ADB forward
    if args.forward or args.all:
        setup_adb_forward()
    
    # Install APK
    if apk_path and (args.install or args.all):
        install_apk(apk_path, args.device)
    
    # Summary
    if apk_path:
        print(f"\n{Colors.OKGREEN}{'='*56}{Colors.ENDC}")
        print(f"{Colors.OKGREEN}APK ready: {apk_path}{Colors.ENDC}")
        print(f"{Colors.OKGREEN}Size: {apk_path.stat().st_size / 1024 / 1024:.2f} MB{Colors.ENDC}")
        print(f"{Colors.OKGREEN}{'='*56}{Colors.ENDC}")

if __name__ == "__main__":
    main()
