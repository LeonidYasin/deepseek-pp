import os
import sys
import time
import json
import subprocess
import re
from datetime import datetime

def run_command_live(cmd):
    print(f"\n⚙️  [EXEC] Запуск Live-команды: {cmd}")
    return subprocess.run(cmd, shell=True)

def run_command_capture(cmd):
    print(f"⚙️  [EXEC] Запрос данных: {cmd}")
    result = subprocess.run(cmd, shell=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    return result

def get_current_version():
    """Читает версию из package.json"""
    try:
        with open("package.json", "r") as f:
            data = json.load(f)
            return data.get("version", "0.7.1")
    except Exception as e:
        print(f"⚠️ Не удалось прочитать package.json: {e}")
        return "0.7.1"

def update_version_in_files(new_version):
    """Обновляет версию в package.json и других файлах"""
    print(f"📝 Обновляем версию до {new_version}...")
    
    # Обновляем package.json
    try:
        with open("package.json", "r") as f:
            data = json.load(f)
        data["version"] = new_version
        with open("package.json", "w") as f:
            json.dump(data, f, indent=2)
        print(f"   ✅ package.json обновлён")
    except Exception as e:
        print(f"   ❌ Ошибка: {e}")
    
    # Обновляем wxt.config.ts (если там есть версия)
    try:
        with open("wxt.config.ts", "r") as f:
            content = f.read()
        content = re.sub(r"version: ['\"][\d.]+['\"]", f'version: "{new_version}"', content)
        with open("wxt.config.ts", "w") as f:
            f.write(content)
        print(f"   ✅ wxt.config.ts обновлён")
    except Exception as e:
        print(f"   ⚠️ Не удалось обновить wxt.config.ts: {e}")

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
        if any(x in line for x in ["failed", "must keep", "❌", "##[error]", "Error:", "failed:", "Validate release ref"]):
            clean = re.sub(r".*Run quality gates\s+\d+-%d+-%d+T\d+:\d+:\d+\.\d+Z\s+", "", line)
            if clean.strip() and clean.strip() not in errors:
                errors.append(clean.strip())
                
    if errors:
        for err in errors:
            print(f"🚨 {err}")
        
        # Специальная проверка для ошибки валидации тега
        if "Validate release ref" in str(errors):
            print("\n💡 ВЕРСИЯ ТЕГА НЕ СООТВЕТСТВУЕТ package.json!")
            current_ver = get_current_version()
            print(f"   Текущая версия в package.json: v{current_ver}")
            print(f"   Используйте тег: v{current_ver}")
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

# --- СОЗДАЁМ ПАПКУ ДЛЯ СБОРОК (ЕСЛИ ЕЁ НЕТ) ---
BUILD_DIR = "/sdcard/Download/deepseek-builds"
os.makedirs(BUILD_DIR, exist_ok=True)
print(f"📁 Папка для сборок: {BUILD_DIR}")

# --- ЧИТАЕМ ТЕКУЩУЮ ВЕРСИЮ ---
current_version = get_current_version()
print(f"📦 Текущая версия проекта: v{current_version}")

# Спрашиваем, нужно ли обновить версию
print("\n❓ Обновить версию? (y/N): ", end="")
sys.stdout.flush()
answer = input().strip().lower()

if answer in ["y", "yes", "д", "да"]:
    print("\n📝 Введите новую версию (например, 0.7.3): ", end="")
    new_version = input().strip()
    if new_version:
        update_version_in_files(new_version)
        current_version = new_version

# Генерируем тег, совместимый с GitHub Actions
timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
# Используем версию из package.json для тега
tag_name = f"v{current_version}-auto-{timestamp}"
print(f"\n🏷️  Создаём тег: {tag_name}")

print("\n🔍 [ЭТАП 1] Подготовка локального Git...")
run_command_live("git status")
run_command_live("git add -A")

print(f"\n📝 [ЭТАП 2] Коммит и создание тега {tag_name}...")
# Используем сообщение коммита, которое не вызовет проблем
run_command_live(f'git commit -m "build: auto-deploy v{current_version} [skip ci]" --verbose')
run_command_capture(f"git tag {tag_name}")

branch_res = run_command_capture("git branch --show-current")
current_branch = branch_res.stdout.strip() or "main"

print("\n🚀 [ЭТАП 3] Отправка изменений на GitHub...")
run_command_live(f"git push origin {current_branch}")
push_tag_res = run_command_live(f"git push origin {tag_name}")
if push_tag_res.returncode != 0:
    print(f"❌ Ошибка отправки тега. Код возврата: {push_tag_res.returncode}")
    sys.exit(1)

print("\n⏳ [ЭТАП 4] Ожидание запуска Actions...")
time.sleep(5)
run_id = None

for attempt in range(30):
    print(f"\n--- Попытка поиска {attempt + 1}/30 ---")
    cmd = f"gh run list --repo={TARGET_REPO} --limit 5 --json databaseId,workflowName,status,conclusion,createdAt,event"
    res = run_command_capture(cmd)
    
    try:
        runs = json.loads(res.stdout)
        if runs:
            print(f"📋 Найдено недавних сборок: {len(runs)}")
            # Ищем сборку, запущенную по нашему тегу
            for run in runs:
                if run["event"] == "push" and run["status"] in ["in_progress", "queued", "waiting"]:
                    run_id = run["databaseId"]
                    wf_name = run["workflowName"]
                    print(f"🎯 НАШЛИ АКТИВНУЮ СБОРКУ! ID: {run_id} [{wf_name}]")
                    break
            if not run_id:
                for run in runs:
                    if run["status"] in ["in_progress", "queued", "waiting"]:
                        run_id = run["databaseId"]
                        wf_name = run["workflowName"]
                        print(f"🎯 Нашли активную сборку: ID: {run_id} [{wf_name}]")
                        break
        else:
            print("📋 Список сборок пока пуст...")
    except Exception as parse_err:
        print(f"❌ Ошибка анализа ответа GitHub: {parse_err}")
        
    if run_id:
        break
    print("💤 Спим 5 секунд перед следующим опросом API...")
    time.sleep(5)

if not run_id:
    print("\n⚠️ Активный процесс не найден. Возможно, Actions не запустились.")
    print("💡 Проверьте вручную: https://github.com/" + TARGET_REPO + "/actions")
    sys.exit(1)

print("\n🔄 [ЭТАП 5] Подключение к трансляции логов...")
print("=============================================================")
try:
    run_command_live(f"gh run watch {run_id} --repo={TARGET_REPO}")
except Exception as e:
    print(f"⚠️ Сетевое прерывание: {e}")

time.sleep(4)

final_check = run_command_capture(f"gh run view {run_id} --repo={TARGET_REPO} --json conclusion,workflowName")
try:
    final_data = json.loads(final_check.stdout)
    conclusion = final_data.get("conclusion")
    wf_name = final_data.get("workflowName")
except Exception:
    conclusion = "unknown"
    wf_name = "unknown"

if conclusion != "success":
    print(f"\n❌ СБОРКА [{wf_name}] ЗАВЕРШИЛАСЬ С ОШИБКОЙ: {conclusion}")
    smart_parse_errors(run_id, TARGET_REPO)
    
    # Дополнительная диагностика
    print("\n📋 Проверка тега:")
    print(f"   Тег: {tag_name}")
    print(f"   Версия в package.json: v{current_version}")
    print("\n💡 Если ошибка связана с несовпадением версий, попробуйте:")
    print("   1. Убедитесь, что тег начинается с 'v' и версия совпадает")
    print("   2. Запустите сборку вручную из интерфейса GitHub Actions")
    sys.exit(1)

print(f"\n✅ Сборка [{wf_name}] успешна! Скачиваем расширение...")

print("\n📦 [ЭТАП 6] Скачивание артефактов...")
time.sleep(3)
run_command_live("rm -rf ./build_artifacts && mkdir -p ./build_artifacts")

# Скачиваем zip из релиза
download_res = run_command_live(f'gh release download {tag_name} --repo={TARGET_REPO} --pattern "*.zip" --dir ./build_artifacts')

if download_res.returncode != 0 or not os.listdir("./build_artifacts"):
    print("⚠️ Прямое скачивание по тегу не удалось. Пробуем последний релиз...")
    run_command_live(f'gh release download --repo={TARGET_REPO} --pattern "*.zip" --dir ./build_artifacts')

print("\n🔓 [ЭТАП 7] Сохранение в папку сборок...")
zip_found = False
final_zip_name = None

for root, dirs, files in os.walk("./build_artifacts"):
    for file in files:
        if file.endswith(".zip"):
            timestamp_filename = datetime.now().strftime("%Y%m%d_%H%M%S")
            new_filename = f"deepseek-pp_{current_version}_{timestamp_filename}.zip"
            source_path = os.path.join(root, file)
            dest_path = os.path.join(BUILD_DIR, new_filename)
            
            run_command_live(f'cp -v "{source_path}" "{dest_path}"')
            
            # Симлинк на последнюю версию
            latest_link = os.path.join(BUILD_DIR, "deepseek-pp_latest.zip")
            if os.path.islink(latest_link) or os.path.exists(latest_link):
                os.remove(latest_link)
            os.symlink(new_filename, latest_link)
            
            print(f"\n📦 Файл сохранён: {dest_path}")
            print(f"🔗 Симлинк: {latest_link}")
            
            final_zip_name = dest_path
            zip_found = True
            break

if zip_found:
    print("\n=============================================================")
    print("🎉 УСПЕШНО ЗАВЕРШЕНО!")
    print(f"📍 Папка: {BUILD_DIR}")
    print(f"📱 Файл: {final_zip_name}")
    print(f"🔗 Ссылка: {BUILD_DIR}/deepseek-pp_latest.zip")
    print("=============================================================")
    run_command_live("rm -rf ./build_artifacts")
    
    print("\n📋 Последние сборки:")
    run_command_live(f'ls -lt "{BUILD_DIR}" | head -6')
else:
    print("❌ Ошибка: .zip файл не найден.")
