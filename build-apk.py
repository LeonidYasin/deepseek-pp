#!/usr/bin/env python3
"""
APK Build Trigger Script - исправленная версия
Запускает сборку APK через GitHub Actions без дублирования
Usage: python build-apk.py [--watch] [--download] [--run-id ID]
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
    print(f"\n> {msg}")

def print_success(msg):
    print(f"✓ {msg}")

def print_error(msg):
    print(f"✗ {msg}")

def print_warning(msg):
    print(f"⚠ {msg}")

def run_cmd(cmd, check=False):
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    if check and result.returncode != 0:
        print_error(f"Command failed: {cmd}")
        print(result.stderr)
        sys.exit(1)
    return result.stdout.strip(), result.stderr

def get_latest_run(workflow="build-android.yml"):
    """Get latest run ID and status"""
    cmd = f'gh run list --workflow {workflow} --limit 1 --json databaseId,status,conclusion'
    stdout, _ = run_cmd(cmd)
    if stdout:
        try:
            runs = json.loads(stdout)
            if runs:
                return runs[0]
        except:
            pass
    return None

def is_run_in_progress():
    """Check if any run is currently in progress"""
    cmd = 'gh run list --limit 5 --json status --jq ".[] | select(.status == \"in_progress\")"'
    stdout, _ = run_cmd(cmd)
    return bool(stdout)

def trigger_workflow(workflow="build-android.yml", ref="main"):
    """Trigger workflow only if no run in progress"""
    if is_run_in_progress():
        print_warning("A build is already in progress. Skipping new trigger.")
        return None
    
    print_step(f"Triggering workflow: {workflow}")
    cmd = f'gh workflow run {workflow} --ref {ref}'
    stdout, stderr = run_cmd(cmd)
    if "created" in stdout.lower() or "success" in stdout.lower():
        print_success("Workflow triggered")
        time.sleep(3)
        return get_latest_run(workflow)
    else:
        print_error(f"Failed: {stderr}")
        return None

def wait_for_completion(run_id, timeout=600, interval=10):
    """Wait for run to complete"""
    print_step(f"Waiting for run {run_id}...")
    start = time.time()
    while time.time() - start < timeout:
        cmd = f'gh run view {run_id} --json status,conclusion'
        stdout, _ = run_cmd(cmd)
        if stdout:
            try:
                data = json.loads(stdout)
                status = data.get("status")
                conclusion = data.get("conclusion")
                if status == "completed":
                    if conclusion == "success":
                        print_success(f"Run {run_id} completed successfully!")
                        return True
                    else:
                        print_error(f"Run failed: {conclusion}")
                        return False
                else:
                    print(f"  Status: {status}...")
            except:
                pass
        time.sleep(interval)
    print_error("Timeout waiting for run")
    return False

def download_artifacts(run_id, output_dir="build/apk"):
    """Download APK artifacts"""
    print_step(f"Downloading artifacts from run {run_id}")
    Path(output_dir).mkdir(parents=True, exist_ok=True)
    cmd = f'gh run download {run_id} -D {output_dir}'
    run_cmd(cmd)
    
    apk_files = []
    for root, _, files in os.walk(output_dir):
        for f in files:
            if f.endswith(".apk"):
                apk_files.append(os.path.join(root, f))
            elif f.endswith(".zip"):
                zip_path = os.path.join(root, f)
                try:
                    with zipfile.ZipFile(zip_path, 'r') as zf:
                        for member in zf.namelist():
                            if member.endswith(".apk"):
                                zf.extract(member, output_dir)
                                apk_files.append(os.path.join(output_dir, member))
                except:
                    pass
    return apk_files

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--watch', action='store_true', help='Trigger and wait for build')
    parser.add_argument('--download', action='store_true', help='Download latest successful APK')
    parser.add_argument('--run-id', help='Download from specific run ID')
    parser.add_argument('--status', action='store_true', help='Show latest run status')
    args = parser.parse_args()
    
    print("╔════════════════════════════════════════════════╗")
    print("║        DeepSeek++ APK Builder v2.1            ║")
    print("╚════════════════════════════════════════════════╝")
    
    if args.status:
        run = get_latest_run()
        if run:
            print(f"Run ID: {run['databaseId']}")
            print(f"Status: {run['status']}")
            print(f"Conclusion: {run['conclusion']}")
        else:
            print("No runs found")
        return
    
    if args.download:
        run = get_latest_run()
        if run and run.get('conclusion') == 'success':
            apks = download_artifacts(run['databaseId'])
            if apks:
                print_success(f"APK: {apks[0]}")
                print(f"Size: {os.path.getsize(apks[0]) / 1024 / 1024:.2f} MB")
            else:
                print_error("No APK found")
        else:
            print_error("No successful build found")
        return
    
    if args.run_id:
        apks = download_artifacts(args.run_id)
        if apks:
            print_success(f"APK: {apks[0]}")
        return
    
    if args.watch:
        run = trigger_workflow()
        if not run:
            # Maybe a run is already in progress - wait for it
            existing = get_latest_run()
            if existing and existing.get('status') == 'in_progress':
                print_warning("Build already in progress, waiting...")
                run = existing
            else:
                print_error("Could not trigger build")
                return
        
        if wait_for_completion(run['databaseId']):
            apks = download_artifacts(run['databaseId'])
            if apks:
                print(f"\n{'='*50}")
                print_success(f"APK ready: {apks[0]}")
                print(f"{'='*50}")
            else:
                print_error("No APK in artifacts")
        else:
            print_error("Build failed")
        return
    
    parser.print_help()

if __name__ == "__main__":
    main()