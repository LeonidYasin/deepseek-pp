# Инструкция по сборке APK через Android Studio

## Предварительные требования
- Установите [Android Studio](https://developer.android.com/studio)
- Убедитесь, что установлены SDK Platform 33 и Build Tools 33.0.0

## Шаги для сборки:

1. **Откройте проект**
   - Запустите Android Studio
   - Выберите `File > Open`
   - Укажите путь к папке `android` в этом репозитории

2. **Дождитесь синхронизации Gradle**
   - Android Studio автоматически скачает зависимости
   - Если появится ошибка о `google-services.json`, временно закомментируйте строку `apply plugin: 'com.google.gms.google-services'` в `android/app/build.gradle`

3. **Соберите APK**
   - В меню выберите `Build > Build Bundle(s) / APK(s) > Build APK(s)`
   - Дождитесь завершения сборки

4. **Готовый APK**
   - Файл будет находиться в: `android/app/build/outputs/apk/debug/app-debug.apk`

## Альтернативный способ (через командную строку):
```bash
cd android
./gradlew assembleDebug
```

## Установка на телефон
- Скопируйте APK на устройство
- Разрешите установку из неизвестных источников
- Откройте APK файл и установите

## Примечание
- Сборка может занять 5-10 минут
- Для подписанной release-сборки нужен ключ (keystore), для тестирования используйте debug APK
- Google Sign-In не будет работать в debug версии без настройки Firebase
