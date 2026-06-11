# DeepSeek++ Android

This is the Android WebView baseline for DeepSeek++. It loads `chat.deepseek.com`, exposes a native `AndroidBridge`, and injects the staged DeepSeek++ web bundle.

## Build

From the repository root:

```bash
npm run build:android
npm run android:assemble:debug
```

`npm run build:android` builds the Chrome MV3 bundle and stages it under `android/app/src/main/assets/dpp/`. The Gradle task writes the debug APK under `android/app/build/outputs/apk/debug/`.

## Validation Levels

- TypeScript contract tests validate the shared platform capability boundary.
- `npm run build:android` validates web bundle staging.
- `npm run android:assemble:debug` requires a local JDK and Gradle or Gradle wrapper.
- Emulator/WebView login smoke is a separate manual check after the APK builds.

Unsupported browser-extension features are intentionally capability-gated on Android, including Native Messaging, Shell Native Host, browser side panel APIs, context menus, and alarms.
