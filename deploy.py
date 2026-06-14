import os
import sys
import time
import json
import subprocess
import re

def run_command_live(cmd):
    return subprocess.run(cmd, shell=True)

def run_command_capture(cmd):
    result = subprocess.run(cmd, shell=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    return result

def smart_parse_errors(run_id, repo):
    print("\n🔍 [АНАЛИЗАТОР ОШИБОК] Вытаскиваем корневую причину падения...")
    print("=============================================================")
    cmd = f"gh run view {run_id} --repo={repo} --log-failed"
    log_res = run_command_capture(cmd)
    raw_logs = log_res.stdout
    if not raw_logs.strip():
        print("⚠️  Логи недоступны или сборка была отменена.")
        return
    
    errors = []
    for line in raw_logs.splitlines():
        if any(x in line for x in ["failed", "must keep", "❌", "##[error]", "Error:"]):
            clean = re.sub(r".*Run quality gates\s+\d+-\d+-\d+T\d+:\d+:\d+\.\d+Z\s+", "", line)
            if clean.strip() and clean.strip() not in errors:
                errors.append(clean.strip())
                
    if errors:
        for err in errors:
            print(f"🚨 {err}")
    else:
        print("Критическая ошибка в логах не отфильтрована. Последние 10 строк:")
        for line in raw_logs.splitlines()[-10:]:
            print(line)
    print("=============================================================")

repo_view = run_command_capture("gh repo view --json owner,name")
try:
    repo_data = json.loads(repo_view.stdout)
    TARGET_REPO = f"{repo_data['owner']['login']}/{repo_data['name']}"
    print(f"🎯 Целевой репозиторий: {TARGET_REPO}")
except Exception:
    print("❌ Не удалось определить репозиторий. Проверьте 'gh auth status'")
    sys.exit(1)

print("\n🔍 [ЭТАП 1] Подготовка локального Git...")
run_command_live("git status")
run_command_live("git add -A")

unique_suffix = int(time.time())
tag_name = f"v0.7.1-auto-{unique_suffix}"

print(f"\n📝 [ЭТАП 2] Коммит и создание тега {tag_name}...")
run_command_live('git commit -m "fix: clean config adjustment for i18n validator passed" --verbose')
run_command_capture(f"git tag {tag_name}")

branch_res = run_command_capture("git branch --show-current")
current_branch = branch_res.stdout.strip() or "main"

print("\n🚀 [ЭТАП 3] Отправка изменений на GitHub...")
run_command_live(f"git push origin {current_branch}")
push_tag_res = run_command_live(f"git push origin {tag_name}")
if push_tag_res.returncode != 0:
    print("❌ Ошибка отправки тега.")
    sys.exit(1)

print("\n⏳ [ЭТАП 4] Перехват запущенного процесса Actions...")
run_id = None

for attempt in range(20):
    print(f"Поиск активного процесса (попытка {attempt + 1}/20)...", end="\r")
    for status in ["in_progress", "queued"]:
        cmd = f"gh run list --repo={TARGET_REPO} --status={status} --limit 2 --json databaseId,workflowName"
        res = run_command_capture(cmd)
        try:
            runs = json.loads(res.stdout)
            if runs:
                run_id = runs[0]["databaseId"]
                wf_name = runs[0]["workflowName"]
                print(f"\n🎯 ПРОЦЕСС ХВАТИЛСЯ! ID: {run_id} [{wf_name}]")
                break
        except Exception:
            pass
    if run_id:
        break
    time.sleep(4)

if not run_id:
    print("\n⚠️ Активный процесс не найден мгновенно. Берем самый последний созданный билдинг:")
    cmd = f"gh run list --repo={TARGET_REPO} --limit 1 --json databaseId"
    res = json.loads(run_command_capture(cmd).stdout)
    if res:
        run_id = res[0]["databaseId"]
        print(f"🎯 Подключились к крайнему ID: {run_id}")
    else:
        print("❌ Сборок в репозитории не найдено.")
        sys.exit(1)

print("\n🔄 [ЭТАП 5] Подключение к трансляции логов сервера...")
print("=============================================================")
run_command_live(f"gh run watch {run_id} --repo={TARGET_REPO}")

final_check = run_command_capture(f"gh run view {run_id} --repo={TARGET_REPO} --json conclusion")
try:
    conclusion = json.loads(final_check.stdout).get("conclusion")
except Exception:
    conclusion = "unknown"

if conclusion != "success":
    print("\n❌ СБОРКА УПАЛА.")
    smart_parse_errors(run_id, TARGET_REPO)
    sys.exit(1)

print("\n✅ Сборка успешна! Извлекаем архив расширения...")

print("\n📦 [ЭТАП 6] Скачивание артефактов...")
time.sleep(3)
run_command_live("mkdir -p ./build_artifacts")
run_command_live(f"gh run download {run_id} --repo={TARGET_REPO} --dir ./build_artifacts")

print("\n🔓 [ЭТАП 7] Сборка zip-пакета для Android...")
run_command_live("unzip -o ./build_artifacts/*.zip -d ./build_artifacts/ 2>/dev/null")

zip_found = False
for root, dirs, files in os.walk("./build_artifacts"):
    for file in files:
        if file.endswith(".zip") and "artifact" not in file:
            run_command_live(f'cp -v "{os.path.join(root, file)}" /sdcard/Download/deepseek-mobile.zip')
            zip_found = True
            break
    if "manifest.json" in files:
        run_command_live("cd ./build_artifacts && zip -r ../deepseek-mobile.zip ./* -x \"*.zip\" && cd ..")
        run_command_live("cp -v ./deepseek-mobile.zip /sdcard/Download/deepseek-mobile.zip && rm ./deepseek-mobile.zip")
        zip_found = True
        break

if zip_found:
    print("=============================================================")
    print("🎉 УСПЕШНО ЗАВЕРШЕНО!")
    print("📍 Расширение скопировано: /sdcard/Download/deepseek-mobile.zip")
    print("=============================================================")
    run_command_live("rm -rf ./build_artifacts")
else:
    print("❌ Не удалось найти файлы манифеста внутри собранного контейнера.")
