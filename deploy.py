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
        if any(x in line for x in ["failed", "must keep", "❌", "##[error]", "Error:", "failed:"]):
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

# --- НАДЕЖНОЕ ОПРЕДЕЛЕНИЕ ТВОЕГО РЕПОЗИТОРИЯ ИЗ GIT REMOTE ---
remote_res = run_command_capture("git remote get-url origin")
remote_url = remote_res.stdout.strip()

match = re.search(r"github\.com[:/](.+?)(?:\.git)?$", remote_url)
if match:
    TARGET_REPO = match.group(1)
    print(f"🎯 Целевой репозиторий: {TARGET_REPO}")
else:
    print(f"❌ Не удалось распарсить Git remote URL: {remote_url}")
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
    cmd = f"gh run list --repo={TARGET_REPO} --limit 5 --json databaseId,workflowName,status,conclusion,createdAt"
    res = run_command_capture(cmd)
    
    try:
        runs = json.loads(res.stdout)
        if runs:
            print(f"📋 Найдено активных/недавних сборок: {len(runs)}")
            
            # Приоритетно перехватываем воркфлоу релиза
            for run in runs:
                if run["status"] in ["in_progress", "queued", "waiting"] and "Release" in run["workflowName"]:
                    run_id = run["databaseId"]
                    wf_name = run["workflowName"]
                    print(f"🎯 НАШЛИ ПРОЦЕСС РЕЛИЗА! Захватываем ID: {run_id} [{wf_name}]")
                    break
            
            # Если релиза еще нет в списке активных, берем CI билд
            if not run_id:
                for run in runs:
                    if run["status"] in ["in_progress", "queued", "waiting"]:
                        run_id = run["databaseId"]
                        wf_name = run["workflowName"]
                        print(f"🎯 Нашли активный сопутствующий билд: ID: {run_id} [{wf_name}]")
                        break
        else:
            print("📋 Список сборок пока пуст...")
    except Exception as parse_err:
        print(f"❌ Ошибка анализа ответа GitHub: {parse_err}")
        
    if run_id:
        break
    print("💤 Спим 4 секунды перед следующим опросом API...")
    time.sleep(4)

if not run_id:
    print("\n⚠️ Активный процесс не поймался по статусу. Берем самую верхнюю сборку принудительно:")
    cmd = f"gh run list --repo={TARGET_REPO} --limit 1 --json databaseId"
    try:
        res = json.loads(run_command_capture(cmd).stdout)
        if res:
            run_id = res[0]["databaseId"]
            print(f"🎯 Подключились к верхнему ID: {run_id}")
    except Exception as e:
        print(f"❌ Сборок в репозитории вообще не найдено: {e}")
        sys.exit(1)

print("\n🔄 [ЭТАП 5] Подключение к трансляции логов сервера...")
print("=============================================================")
try:
    run_command_live(f"gh run watch {run_id} --repo={TARGET_REPO}")
except Exception as e:
    print(f"⚠️ Сетевое прерывание во время слежения (продолжаем работу): {e}")

time.sleep(3)

final_check = run_command_capture(f"gh run view {run_id} --repo={TARGET_REPO} --json conclusion,workflowName")
try:
    final_data = json.loads(final_check.stdout)
    conclusion = final_data.get("conclusion")
    wf_name = final_data.get("workflowName")
except Exception:
    conclusion = "unknown"
    wf_name = "unknown"

if conclusion != "success":
    print(f"\n❌ СБОРКА [{wf_name}] ЗАВЕРШИЛАСЬ С ОШИБКОЙ ИЛИ СТАТУСОМ: {conclusion}")
    smart_parse_errors(run_id, TARGET_REPO)
    sys.exit(1)

print(f"\n✅ Сборка [{wf_name}] успешна! Переходим к скачиванию расширения...")

print("\n📦 [ЭТАП 6] Скачивание артефактов...")
time.sleep(2)
run_command_live("rm -rf ./build_artifacts && mkdir -p ./build_artifacts")

# Пытаемся скачать из текущего билда
download_res = run_command_live(f"gh run download {run_id} --repo={TARGET_REPO} --dir ./build_artifacts")

# Если билд не вернул артефактов (например, зацепили старый CI), делаем фоллбэк на последний успешный Release воркфлоу
if download_res.returncode != 0 or not os.listdir("./build_artifacts"):
    print("⚠️  Текущий билд не содержит файлов артефактов. Ищем последний успешный Release Extension...")
    find_rel_cmd = f'gh run list --repo={TARGET_REPO} --workflow="Release Extension" --status=success --limit 1 --json databaseId'
    try:
        rel_runs = json.loads(run_command_capture(find_rel_cmd).stdout)
        if rel_runs:
            last_success_release_id = rel_runs[0]["databaseId"]
            print(f"🎯 Найдена прошлая успешная сборка релиза ID: {last_success_release_id}. Скачиваем файлы оттуда...")
            run_command_live(f"gh run download {last_success_release_id} --repo={TARGET_REPO} --dir ./build_artifacts")
        else:
            print("⚠️ Успешных релизов в истории не найдено. Пробуем скачать любой последний доступный артефакт...")
            run_command_live(f"gh run download --repo={TARGET_REPO} --dir ./build_artifacts")
    except Exception as e:
        print(f"❌ Ошибка поиска релизов: {e}")

print("\n🔓 [ЭТАП 7] Перенос zip-пакета для Android...")
run_command_live("unzip -o ./build_artifacts/**/*.zip -d ./build_artifacts/ 2>/dev/null")

zip_found = False
# Проверяем, скачался ли готовый zip
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
    print("❌ Ошибка: Не удалось найти файлы расширения или .zip внутри скачанных артефактов.")
