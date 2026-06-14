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

def parse_and_print_wxt_errors(run_id):
    print("\n🔍 [АНАЛИЗАТОР ОШИБОК] Извлекаем и фильтруем лог краша сборки...")
    print("=============================================================")
    log_res = run_command_capture(f"gh run view {run_id} --log-failed")
    raw_logs = log_res.stdout
    if not raw_logs.strip():
        print("⚠️  Сервер не вернул детальных логов.")
        return
    lines = raw_logs.splitlines()
    critical_errors = []
    ts_err_regex = re.compile(r"(error TS\d+:|ERR_MODULE_NOT_FOUND)")
    wxt_err_regex = re.compile(r"(.*failed.*|.*failed to compile.*|.*Error:.*)", re.IGNORECASE)
    i18n_err_regex = re.compile(r"(.*I18n locale check failed.*|.*must keep Chrome.*)")
    for line in lines:
        clean_line = line.strip()
        if "##[error]" in clean_line:
            clean_line = clean_line.replace("##[error]", "❌ ОШИБКА: ")
        if (ts_err_regex.search(clean_line) or wxt_err_regex.search(clean_line) or i18n_err_regex.search(clean_line) or "npm error" in clean_line.lower()):
            if clean_line not in critical_errors:
                critical_errors.append(clean_line)
    if critical_errors:
        print(f"🚨 ОБНАРУЖЕНО КРИТИЧЕСКИХ ОШИБОК СБОРКИ: {len(critical_errors)}\n")
        for err in critical_errors:
            print(f"⚠️  {err}")
    else:
        print("❓ Последние 20 строк лога:")
        for line in lines[-20:]:
            print(line)
    print("=============================================================")

print("🔍 [ЭТАП 1] Проверка текущего состояния репозитория...")
run_command_live("git status")
print("\n📦 [ЭТАП 2] Добавление файлов в индекс Git...")
run_command_live("git add -A")

unique_suffix = int(time.time())
tag_name = f"v0.7.1-auto-{unique_suffix}"

print(f"\n📝 [ЭТАП 3] Создание коммита и генерация тега {tag_name}...")
run_command_live('git commit -m "fix: restore standard chromium set for i18n bypass" --verbose')
run_command_capture(f"git tag {tag_name}")

branch_res = run_command_capture("git branch --show-current")
current_branch = branch_res.stdout.strip() or "main"

print(f"\n🚀 [ЭТАП 4] Отправка изменений на GitHub...")
run_command_live(f"git push origin {current_branch}")
push_tag_res = run_command_live(f"git push origin {tag_name}")
if push_tag_res.returncode != 0:
    print("❌ Ошибка отправки тега.")
    sys.exit(1)

print("\n⏳ [ЭТАП 5] Ожидание инициализации любого нового процесса на сервере...")
time.sleep(8) # Даем фору на старт

run_id = None
for attempt in range(15):
    print(f"Запрос статуса сборки (попытка {attempt + 1}/15)...", end="\r")
    run_list_res = run_command_capture("gh run list --limit 3 --json databaseId,status")
    try:
        runs = json.loads(run_list_res.stdout)
        if runs:
            # Железобетонно берем самую последнюю запущенную таску в репозитории
            run_id = runs[0]["databaseId"]
            print(f"\n🎯 СБОРКА ХВАТИЛАСЬ! ID процесса Actions: {run_id}")
            break
    except Exception:
        pass
    time.sleep(4)

if not run_id:
    print("\n❌ Сборка не найдена в API.")
    sys.exit(1)

print("\n🔄 [ЭТАП 6] Мониторинг сборки на GitHub...")
print("=============================================================")
last_status = ""
while True:
    view_res = run_command_capture(f"gh run view {run_id} --json status,conclusion,updatedAt")
    try:
        status_data = json.loads(view_res.stdout)
        status = status_data.get("status")
        conclusion = status_data.get("conclusion")
        updated_at = status_data.get("updatedAt", "")
    except Exception:
        time.sleep(10)
        continue

    if status != last_status:
        print(f"⏰ [{updated_at}] Статус: -> {status.upper()}")
        last_status = status

    if status == "completed":
        if conclusion == "success":
            print(f"\n✅ УСПЕХ! Сборка завершена.")
            break
        else:
            print(f"\n❌ ОШИБКА: Сборка провалилась ({conclusion}).")
            parse_and_print_wxt_errors(run_id)
            sys.exit(1)
    time.sleep(15)

print("\n📦 [ЭТАП 7] Получение артефактов...")
repo_view = run_command_capture("gh repo view --json owner,name")
repo_data = json.loads(repo_view.stdout)
owner = repo_data["owner"]["login"]
repo_name = repo_data["name"]

time.sleep(5)
artifact_res = run_command_capture(f"gh api repos/{owner}/{repo_name}/actions/runs/{run_id}/artifacts")
try:
    artifacts_data = json.loads(artifact_res.stdout)
    artifact = artifacts_data["artifacts"][0]
    artifact_id = artifact["id"]
    print(f"📊 Найден артефакт: ID {artifact_id}")
except Exception:
    print("❌ Архив не найден среди артефактов. Ответ API:", artifact_res.stdout)
    sys.exit(1)

print("\n📂 [ЭТАП 8] Скачивание сборки...")
run_command_live("mkdir -p ./build_artifacts")
token = run_command_capture("gh auth token").stdout.strip()
download_cmd = f'curl -L -# -H "Authorization: Bearer {token}" "https://api.github.com/repos/{owner}/{repo_name}/actions/artifacts/{artifact_id}/zip" -o ./build_artifacts/artifact.zip'
run_command_live(download_cmd)

print("\n🔓 [ЭТАП 9] Подготовка архива...")
run_command_live("unzip -o ./build_artifacts/artifact.zip -d ./build_artifacts/")
run_command_live("rm ./build_artifacts/artifact.zip")

print("\n📲 [ЭТАП 10] Копирование в память телефона...")
zip_found = False
for root, dirs, files in os.walk("./build_artifacts"):
    for file in files:
        if file.endswith(".zip"):
            run_command_live(f'cp -v "{os.path.join(root, file)}" /sdcard/Download/deepseek-mobile.zip')
            zip_found = True
            break
    if "manifest.json" in files:
        run_command_live("cd ./build_artifacts && zip -r ../deepseek-mobile.zip ./* && cd ..")
        run_command_live("cp -v ./deepseek-mobile.zip /sdcard/Download/deepseek-mobile.zip && rm ./deepseek-mobile.zip")
        zip_found = True
        break

if zip_found:
    print("=============================================================")
    print("🎉 ГОТОВО! Билд в загрузках: /sdcard/Download/deepseek-mobile.zip")
    print("=============================================================")
    run_command_live("rm -rf ./build_artifacts")
else:
    print("❌ Файлы не найдены.")
