#!/data/data/com.termux/files/usr/bin/bash

echo "🔍 ПРОВЕРКА НАСТРОЕК GITHUB ACTIONS"
echo "========================================"

# 1. Проверяем, есть ли воркфлоу
echo ""
echo "📁 1. Проверка файлов воркфлоу:"
if [ -d ".github/workflows" ]; then
    echo "✅ Папка .github/workflows существует"
    ls -la .github/workflows/
else
    echo "❌ Папка .github/workflows НЕ СУЩЕСТВУЕТ!"
    echo "   Нужно создать release.yml"
fi

# 2. Проверяем содержимое release.yml
echo ""
echo "📄 2. Содержимое release.yml:"
if [ -f ".github/workflows/release.yml" ]; then
    echo "---"
    cat .github/workflows/release.yml | head -30
    echo "---"
else
    echo "❌ Файл release.yml не найден!"
fi

# 3. Проверяем, включены ли Actions в репозитории
echo ""
echo "⚙️ 3. Проверка статуса Actions в репозитории:"
echo "   Откройте в браузере: https://github.com/LeonidYasin/deepseek-pp/actions"
echo "   Если Actions отключены, включите их в Settings → Actions → General"

# 4. Проверяем последние запуски вручную
echo ""
echo "📊 4. Последние запуски Actions:"
gh run list --repo=LeonidYasin/deepseek-pp --limit 5

echo ""
echo "========================================"
echo "💡 Если Actions не запускаются, создайте минимальный workflow:"
echo ""
