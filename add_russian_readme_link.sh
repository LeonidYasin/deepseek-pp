#!/data/data/com.termux/files/usr/bin/bash

# Скрипт для добавления ссылки на русский README в главный README.md
# Запуск: bash add_russian_readme_link.sh

set -e

echo "📝 Добавляем ссылку на русский README в README.md..."

# Проверяем, существует ли файл
if [ ! -f "README.md" ]; then
    echo "❌ Ошибка: README.md не найден в текущей директории"
    exit 1
fi

# Проверяем, есть ли уже ссылка на русский README
if grep -q "README_RU.md" README.md; then
    echo "✅ Ссылка на русский README уже существует в README.md"
    exit 0
fi

# Создаем резервную копию
cp README.md README.md.backup
echo "📦 Создана резервная копия: README.md.backup"

# Добавляем ссылку с помощью sed
# Ищем строку с "English README" и добавляем после нее ссылку на русский
sed -i 's/\(<a href="README_EN.md">English README<\/a> \)/\1·\n  <a href="README_RU.md">Русский README<\/a> · /' README.md

# Альтернативный вариант, если первый не сработал
if ! grep -q "README_RU.md" README.md; then
    echo "⚠️ Первый способ не сработал, пробуем альтернативный..."
    
    # Ищем строку с English README и заменяем всю строку
    sed -i '/<a href="README_EN.md">English README<\/a>/c\
  <a href="README_EN.md">English README</a> ·\
  <a href="README_RU.md">Русский README</a> ·\
  <a href="#产品定位">产品定位</a> ·\
  <a href="#功能速览">功能速览</a> ·\
  <a href="#适合场景">适合场景</a> ·\
  <a href="#安装">安装</a> ·\
  <a href="#071-变更回顾">0.7.1 变更</a>' README.md
fi

# Проверяем результат
if grep -q "README_RU.md" README.md; then
    echo "✅ Ссылка успешно добавлена!"
    echo ""
    echo "Проверьте результат:"
    grep -A2 "English README" README.md | head -5
else
    echo "❌ Не удалось добавить ссылку автоматически"
    echo "Восстанавливаем резервную копию..."
    mv README.md.backup README.md
    exit 1
fi

echo ""
echo "✨ Готово! Теперь в README.md есть ссылка на русскую версию."
echo "   Резервная копия сохранена как README.md.backup"
