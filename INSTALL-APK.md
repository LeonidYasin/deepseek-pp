# Installing DeepSeek++ APK

## Download the APK

### Option 1: Download from GitHub Actions
1. Go to https://github.com/LeonidYasin/deepseek-pp/actions
2. Click on the latest successful build (green checkmark)
3. Scroll to "Artifacts" section
4. Download `deepseek-android-apk.zip`
5. Extract the `.apk` file

### Option 2: Use the download script
```bash
./download-latest-apk.sh
```

## Install on Android

1. **Enable unknown sources**
   - Settings → Security → Unknown sources (enable)
   - Or allow installation from your file manager

2. **Copy APK to phone**
   - Via USB cable
   - Via cloud storage (Google Drive, Dropbox)
   - Via local network (use `./serve-apk.sh` script)

3. **Install**
   - Open file manager
   - Navigate to the APK
   - Tap to install

## First Run Setup

1. **Open the app**
2. **Sign in with Google** (or skip if you prefer)
3. **Configure MCP server**
   - Tap menu (three dots) → Settings
   - Enter MCP server URL (e.g., `http://192.168.1.100:3000/mcp`)
   - Save
4. **Reload the page**

## Features

- ✅ Full DeepSeek chat interface
- ✅ MCP server integration
- ✅ Google Sign-In
- ✅ Swipe to refresh
- ✅ Customizable settings

## Troubleshooting

### WebView not loading
- Check internet connection
- Clear app cache (Settings → Apps → DeepSeek++ → Clear cache)

### MCP server not connecting
- Verify server URL is correct
- Ensure server is running (`docker-compose ps`)
- Check network connectivity (same WiFi network)

### Google Sign-In not working
- Ensure Google Play Services is up to date
- Check internet connection
- Try reinstalling the app

## Building from source

```bash
# Clone repository
git clone https://github.com/LeonidYasin/deepseek-pp.git
cd deepseek-pp/android

# Build APK
./gradlew assembleRelease

# Output location
# app/build/outputs/apk/release/app-release.apk
```

## Support

For issues, open an issue on GitHub: https://github.com/LeonidYasin/deepseek-pp/issues
