import os
import sys
import time
import json
import subprocess
import re

def run_command_live(cmd):
    print(f"\n⚙️  [EXEC] Запуск Live-команды: {cmd}")
    return subprocess.run(cmd, shell=True)

def run_command_capture(cmd):
    print(f"⚙️  [EXEC] Запрос данных: {cmd}")
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
            clean = re.sub(r".*Run quality gates\s+\d+-%d+-%d+T\d+:\d+:\d+\.\d+Z\s+", "", line)
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

# --- ШАГ 0: Динамически определяем форк ---
repo_view = run_command_capture("gh repo view --json owner,name")
try:
    repo_data = json.loads(repo_view.stdout)
    TARGET_REPO = f"{repo_data['owner']['login']}/{repo_data['name']}"
    print(f"🎯 Определён целевой репозиторий: {TARGET_REPO}")
except Exception as e:
    print(f"❌ Ошибка определения репозитория: {e}")
    print(f"Сырой вывод gh repo view: {repo_view.stdout or repo_view.stderr}")
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
    print(f"❌ Ошибка отправки тега. Код возврата: {push_tag_res.returncode}")
    sys.exit(1)

print("\n⏳ [ЭТАП 4] Перехват запущенного процесса Actions...")
run_id = None

for attempt in range(25):
    print(f"\n--- Попытка поиска {attempt + 1}/25 ---")
    cmd = f"gh run list --repo={TARGET_REPO} --limit 3 --json databaseId,workflowName,status,conclusion,createdAt"
    res = run_command_capture(cmd)
    
    print(f"📥 Сырой ответ от GitHub API:\n{res.stdout}")
    if res.stderr:
        print(f"⚠️  Ошибки команды (stderr): {res.stderr}")
        
    try:
        runs = json.loads(res.stdout)
        if runs:
            print(f"📋 Найдено сборок в списке: {len(runs)}")
            for idx, run in enumerate(runs):
                print(f"  [{idx}] ID: {run['databaseId']} | Workflow: {run['workflowName']} | Status: {run['status']} | Conclusion: {run.get('conclusion')} | Created: {run['createdAt']}")
                
                # Проверяем, подходит ли сборка под активную
                if run["status"] in ["in_progress", "queued", "waiting"]:
                    run_id = run["databaseId"]
                    wf_name = run["workflowName"]
                    print(f"🎯 НАШЛИ АКТИВНЫЙ БИЛД! Захватываем ID: {run_id} [{wf_name}]")
                    break
        else:
            print("📋 Список сборок вернулся пустым []")
    except Exception as parse_err:
        print(f"❌ Ошибка парсинга JSON: {parse_err}")
        
    if run_id:
        break
    print("💤 Спим 4 секунды перед следующим опросом...")
    time.sleep(4)

if not run_id:
    print("\n⚠️ Активный процесс не поймался по статусу за все попытки. Пробуем взять самый верхний принудительно:")
    cmd = f"gh run list --repo={TARGET_REPO} --limit 1 --json databaseId"
    try:
        res = json.loads(run_command_capture(cmd).stdout)
        if res:
            run_id = res[0]["databaseId"]
            print(f"🎯 Подключились вслепую к верхнему ID: {run_id}")
    except Exception as e:
        print(f"❌ Сборок в репозитории вообще не найдено через API: {e}")
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
