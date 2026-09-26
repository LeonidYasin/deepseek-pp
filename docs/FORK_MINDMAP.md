# Ментальная карта форка — путь к «бесконечному» агенту

```mermaid
mindmap
  root((Форк deepseek-pp))
    Что уже есть
      Inline Agent Loop
        Цикл генерация→tool→результат
        XmlToolStreamFilter (парсинг потока)
      Memory (RAG-lite)
        4 типа: user/feedback/topic/reference
        Pin + injection в промпт
      Projects
        Инструкции + проектная память
        Saved items
      Skills
        Slash-команды
        Импорт с GitHub
      Automation
        Dedicated-сессии
        Cron / RRULE
      MCP
        5 транспортов
        Streamable HTTP / HTTP / SSE / Native
    Чего не хватает
      🟢 A: AGENTS.md
        Авто-загрузка контекста проекта
        В каждую сессию
        Решает «напоминать контекст»
      🟡 B: Context compression
        Суммаризация старых шагов
        Порог токенов (estimator уже есть)
        Решает переполнение
      🔴 C: Sub-agents
        Подагент с чистой сессией
        Главный контекст не пухнет
        Максимум автономности
      🔵 D: Checkpoints
        Прогресс в файл
        Resume после обрыва
        Страховка
    Целевой результат
      Бесконечный агент
      Без напоминания контекста
      Устойчив к переполнению
      Автономен на длинных задачах
```

## Ссылки

- Вики проекта: https://deepwiki.com/zhu1090093659/deepseek-pp/1-overview
- ROADMAP форка: [`ROADMAP_FORK.md`](../ROADMAP_FORK.md)
- Аналог у Claude: `CLAUDE.md` + auto-compact + subagents + checkpoints
