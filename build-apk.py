#!/usr/bin/env python3
"""
APK Build Trigger Script - аналогичный deploy.py
Запускает сборку APK через GitHub Actions и скачивает результат
Usage: python build-apk.py [--workflow] [--download] [--watch]
"""

import os
import sys
import subprocess
import argparse
import time
import json
import zipfile
from pathlib import Path

def print_step(msg):
    print(f"\n>>> {msg}")

def print_success(msg):
    print(f"[OK] {msg}")

def print_error(msg):
    print(f"[ERROR] {msg}")

def print_warning(msg):
    print(f"[WARN] {msg}")

def run_cmd(cmd, check=False):
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    if check and result.returncode != 0:
        print_error(f"Command failed: {cmd}")
        if result.stderr:
            print(result.stderr)
        return None
    return result.stdout.strip()

def check_gh_cli():
    stdout = run_cmd("gh --version")
    if not stdout:
        print_error("GitHub CLI not found. Install: https://cli.github.com/")
        return False
    print_success("GitHub CLI found")
    return True

def check_auth():
    stdout = run_cmd("gh auth status")
    if not stdout or "Logged in" not in stdout:
        print_error("Not logged into GitHub. Run: gh auth login")
        return False
    print_success("GitHub authenticated")
    return True

def trigger_workflow(workflow="build-android.yml", ref="main"):
    print_step(f"Triggering workflow: {workflow}")
    stdout = run_cmd(f'gh workflow run {workflow} --ref {ref}')
    if stdout and ("created" in stdout.lower() or "success" in stdout.lower()):
        print_success("Workflow triggered")
        return True
    print_error("Failed to trigger workflow")
    return False

def get_latest_run(workflow="build-android.yml"):
    cmd = f'gh run list --workflow {workflow} --limit 1 --json databaseId,status,conclusion'
    stdout = run_cmd(cmd)
    if stdout:
        try:
            data = json.loads(stdout)
            return data[0] if data else None
        except:
            pass
    return None

def wait_for_completion(run_id, timeout=600, interval=10):
    print_step(f"Waiting for run {run_id}...")
    start = time.time()
    while time.time() - start < timeout:
        cmd = f'gh run view {run_id} --json status,conclusion'
        stdout = run_cmd(cmd)
        if stdout:
            try:
                data = json.loads(stdout)
                status = data.get("status")
                conclusion = data.get("conclusion")
                if status == "completed":
                    if conclusion == "success":
                        print_success(f"Run {run_id} completed!")
                        return True
                    else:
                        print_error(f"Run failed: {conclusion}")
                        return False
                print(f"  Status: {status}...")
            except:
                pass
        time.sleep(interval)
    print_error(f"Timeout waiting for run {run_id}")
    return False

def download_artifacts(run_id, out_dir="build/apk"):
    print_step(f"Downloading artifacts from run {run_id}")
    Path(out_dir).mkdir(parents=True, exist_ok=True)
    run_cmd(f'gh run download {run_id} -D {out_dir}')
    
    apk_files = []
    for root, dirs, files in os.walk(out_dir):
        for f in files:
            if f.endswith(".apk"):
                apk_files.append(os.path.join(root, f))
            elif f.endswith(".zip"):
                zip_path = os.path.join(root, f)
                try:
                    with zipfile.ZipFile(zip_path, 'r') as zf:
                        for m in zf.namelist():
                            if m.endswith(".apk"):
                                zf.extract(m, out_dir)
                                apk_files.append(os.path.join(out_dir, m))
                except:
                    pass
    return apk_files

def list_workflows():
    stdout = run_cmd("gh workflow list")
    print("\nAvailable workflows:")
    print(stdout or "  No workflows found")

def main():
    parser = argparse.ArgumentParser(description='Build APK via GitHub Actions')
    parser.add_argument('--workflow', default='build-android.yml')
    parser.add_argument('--ref', default='main')
    parser.add_argument('--download', action='store_true', help='Download latest APK')
    parser.add_argument('--watch', action='store_true', help='Wait and download')
    parser.add_argument('--list', action='store_true', help='List workflows')
    parser.add_argument('--run-id', help='Download from specific run')
    args = parser.parse_args()
    
    print("=" * 50)
    print("DeepSeek++ APK Builder (GitHub Actions)")
    print("=" * 50)
    
    if not check_gh_cli() or not check_auth():
        sys.exit(1)
    
    if args.list:
        list_workflows()
        return
    
    if args.download:
        latest = get_latest_run(args.workflow)
        if latest and latest.get('conclusion') == 'success':
            apks = download_artifacts(latest['databaseId'])
            if apks:
                print_success(f"APK: {apks[0]}")
            else:
                print_error("No APK found")
        else:
            print_error("No successful build found")
        return
    
    if args.run_id:
        apks = download_artifacts(args.run_id)
        if apks:
            print_success(f"APK: {apks[0]}")
        else:
            print_error("No APK found")
        return
    
    # Trigger new build
    if not trigger_workflow(args.workflow, args.ref):
        sys.exit(1)
    
    time.sleep(3)
    latest = get_latest_run(args.workflow)
    if not latest:
        print_error("Could not get run ID")
        sys.exit(1)
    
    run_id = latest['databaseId']
    print_step(f"Run ID: {run_id}")
    print(f"  https://github.com/LeonidYasin/deepseek-pp/actions/runs/{run_id}")
    
    if args.watch:
        if wait_for_completion(run_id):
            apks = download_artifacts(run_id)
            if apks:
                size = os.path.getsize(apks[0]) / 1024 / 1024
                print(f"\n{'=' * 50}")
                print_success(f"APK ready: {apks[0]} ({size:.2f} MB)")
                print(f"{'=' * 50}")
            else:
                print_error("No APK in artifacts")
        else:
            print_error("Build failed")
    else:
        print(f"\nTo wait and download: python {sys.argv[0]} --watch")

if __name__ == "__main__":
    main()
