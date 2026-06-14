import os
import sys
import time
import json
import subprocess
import re

def run_command_live(cmd):
    """Выполняет команду, транслируя её вывод напрямую в консоль Termux в реальном времени"""
    return subprocess.run(cmd, shell=True)

def run_command_capture(cmd):
    """Вспомогательная функция для скрытого сбора данных (например, JSON от API)"""
    result = subprocess.run(cmd, shell=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    return result

def parse_and_print_wxt_errors(run_id):
    """Интеллектуальный парсер логов сборки GitHub Actions для JS/TS/WXT."""
    print("\n🔍 [АНАЛИЗАТОР ОШИБОК] Извлекаем и фильтруем лог краша сборки...")
    print("=============================================================")
    
    log_res = run_command_capture(f"gh run view {run_id} --log-failed")
    raw_logs = log_res.stdout
    
    if not raw_logs.strip():
        print("⚠️  Сервер не вернул детальных логов. Возможно, сборка прервана на стороне GitHub.")
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
        
        if (ts_err_regex.search(clean_line) or 
            wxt_err_regex.search(clean_line) or 
            i18n_err_regex.search(clean_line) or
            "npm error" in clean_line.lower()):
            
            if clean_line not in critical_errors:
                critical_errors.append(clean_line)

    if critical_errors:
        print(f"🚨 ОБНАРУЖЕНО КРИТИЧЕСКИХ ОШИБОК СБОРКИ: {len(critical_errors)}\n")
        for err in critical_errors:
            print(f"⚠️  {err}")
    else:
        print("❓ Специфическая ошибка сборки. Выводим последние 20 строк лога:")
        print("-------------------------------------------------------------")
        for line in lines[-20:]:
            print(line)
            
    print("=============================================================")

print("🔍 [ЭТАП 1] Проверка текущего состояния репозитория...")
print("-------------------------------------------------------------")
run_command_live("git status")
print("-------------------------------------------------------------")

print("\n📦 [ЭТАП 2] Добавление ВСЕХ измененных и новых файлов в индекс Git...")
run_command_live("git add -A")

print("\n📋 [ЭТАП 2.5] Показываю diff изменений:")
run_command_live("git diff --cached --stat")
print("-------------------------------------------------------------")

unique_suffix = int(time.time())
tag_name = f"v0.7.1-auto-{unique_suffix}"

print(f"\n📝 [ЭТАП 3] Создание коммита и генерация тега {tag_name}...")
print("-------------------------------------------------------------")
commit_res = run_command_live('git commit -m "fix: mobile infrastructure updates and build triggers" --verbose')

run_command_capture(f"git tag {tag_name}")
print("-------------------------------------------------------------")

branch_res = run_command_capture("git branch --show-current")
current_branch = branch_res.stdout.strip() or "main"

print(f"\n🚀 [ЭТАП 4] Отправка изменений и тега на GitHub...")
print("-------------------------------------------------------------")
push_branch_res = run_command_live(f"git push origin {current_branch}")
push_tag_res = run_command_live(f"git push origin {tag_name}")

if push_tag_res.returncode != 0:
    print("\n❌ Ошибка при отправке тега! Процесс остановлен.")
    sys.exit(1)
print("-------------------------------------------------------------")

print("\n⏳ [ЭТАП 5] Умное ожидание регистрации НОВОЙ сборки по тегу...")
run_id = None
attempts = 0
max_attempts = 20

while attempts < max_attempts:
    print(f"Поиск активного процесса на GitHub (попытка {attempts + 1}/{max_attempts})...", end="\r")
    run_list_res = run_command_capture("gh run list --limit 10 --json databaseId,headBranch,status")
    
    try:
        runs = json.loads(run_list_res.stdout)
        for r in runs:
            # Жестко сверяем, что веткой сборки (headBranch) является наш свежий тег
            if r["headBranch"] == tag_name:
                run_id = r["databaseId"]
                break
    except Exception:
        pass

    if run_id:
        print(f"\n🎯 СБОРКА НАЙДЕНА! Перехвачен ID нового процесса: {run_id}")
        break
        
    attempts += 1
    time.sleep(5)

if not run_id:
    print("\n❌ GitHub Actions не зарегистрировал сборку вовремя. Проверьте сеть или вкладку Actions в браузере.")
    sys.exit(1)

print("\n🔄 [ЭТАП 6] Мониторинг удаленной компиляции WXT на серверах GitHub...")
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
        print("⏳ [API] Ожидание ответа от GitHub API...")
        time.sleep(15)
        continue

    if status != last_status:
        print(f"⏰ [{updated_at}] Смена статуса сборки: -> {status.upper()}")
        last_status = status

    if status == "completed":
        if conclusion == "success":
            print(f"\n✅ УСПЕХ! Сборка расширения успешно завершена.")
            break
        else:
            print(f"\n❌ КРИТИЧЕСКАЯ ОШИБКА: Сборка провалилась (СТАТУС: {conclusion}).")
            parse_and_print_wxt_errors(run_id)
            sys.exit(1)
    else:
        print(f"   ...процесс компиляции продолжается... Статус: [{status.upper()}] (проверка через 15 сек)")
        time.sleep(15)

print("\n📦 [ЭТАП 7] Запрос информации о скомпилированном ZIP-архиве...")
repo_view = run_command_capture("gh repo view --json owner,name")
repo_data = json.loads(repo_view.stdout)
owner = repo_data["owner"]["login"]
repo_name = repo_data["name"]

# Даем API гитхаба 5 секунд на генерацию ссылок на артефакты после успешной сборки
time.sleep(5)

artifact_res = run_command_capture(f"gh api repos/{owner}/{repo_name}/actions/runs/{run_id}/artifacts")
try:
    artifacts_data = json.loads(artifact_res.stdout)
    artifact = artifacts_data["artifacts"][0]
    artifact_id = artifact["id"]
    artifact_name = artifact["name"]
    print(f"📊 Найден целевой артефакт: '{artifact_name}'")
except Exception:
    print("❌ Ошибка: Сборка успешна, но упакованный .zip не найден среди артефактов.")
    print(f"Ответ API: {artifact_res.stdout}")
    sys.exit(1)

print("\n📂 [ЭТАП 8] Скачивание архива сборки...")
run_command_live("mkdir -p ./build_artifacts")
token_res = run_command_capture("gh auth token")
token = token_res.stdout.strip()

download_cmd = f'curl -L -# -H "Authorization: Bearer {token}" "https://api.github.com/repos/{owner}/{repo_name}/actions/artifacts/{artifact_id}/zip" -o ./build_artifacts/artifact.zip'
run_command_live(download_cmd)

print("\n🔓 [ЭТАП 9] Распаковка и подготовка расширения...")
print("-------------------------------------------------------------")
run_command_live("unzip -o ./build_artifacts/artifact.zip -d ./build_artifacts/")
run_command_live("rm ./build_artifacts/artifact.zip")
print("-------------------------------------------------------------")

print("\n📲 [ЭТАП 10] Перенос готового расширения в общую память устройства...")
print("-------------------------------------------------------------")
zip_found = False
for root, dirs, files in os.walk("./build_artifacts"):
    for file in files:
        if file.endswith(".zip") or "manifest.json" in files:
            if file.endswith(".zip"):
                zip_source = os.path.join(root, file)
                run_command_live(f'cp -v "{zip_source}" /sdcard/Download/deepseek-mobile.zip')
                zip_found = True
                break
    if "manifest.json" in files:
        print("📦 Обнаружена распакованная структура. Формируем чистый ZIP...")
        run_command_live("cd ./build_artifacts && zip -r ../deepseek-mobile.zip ./* && cd ..")
        run_command_live("cp -v ./deepseek-mobile.zip /sdcard/Download/deepseek-mobile.zip")
        run_command_live("rm ./deepseek-mobile.zip")
        zip_found = True
        break

print("-------------------------------------------------------------")
if zip_found:
    print("=============================================================")
    print("🎉 ОТЛИЧНО! Скрипт автоматизации полностью отработал.")
    print("👉 Мобильное расширение с MCP-настройками готово по пути:")
    print("📍 /sdcard/Download/deepseek-mobile.zip")
    print("=============================================================")
    run_command_live("rm -rf ./build_artifacts")
    sys.exit(0)
else:
    print("❌ Ошибка: Не удалось обнаружить скомпилированную структуру расширения.")
    sys.exit(1)
