#!/bin/bash

# Simple HTTP server to share APK on local network
# Usage: ./serve-apk.sh

echo "=========================================="
echo "APK Sharing Server"
echo "=========================================="
echo

# Find APK file
APK_FILE=$(find . -name "*.apk" -type f 2>/dev/null | head -1)

if [ -z "$APK_FILE" ]; then
    echo "❌ No APK file found in current directory"
    echo "Please extract APK from downloads first"
    exit 1
fi

echo "📱 Sharing APK: $APK_FILE"
echo

# Get local IP
IP=$(ipconfig getifaddr en0 2>/dev/null || hostname -I | awk '{print $1}' 2>/dev/null || echo "localhost")

PORT=8080

echo "🌐 Server starting at: http://$IP:$PORT"
echo "📱 On your phone, open this URL in browser"
echo "🔧 Press Ctrl+C to stop"
echo

# Create simple HTML
cat > /tmp/apk-share.html << EOF
<!DOCTYPE html>
<html>
<head>
    <title>DeepSeek++ APK Download</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
        body { font-family: sans-serif; text-align: center; padding: 20px; }
        .apk-btn { background: #4CAF50; color: white; padding: 15px 30px; text-decoration: none; display: inline-block; border-radius: 8px; font-size: 20px; margin: 20px; }
    </style>
</head>
<body>
    <h1>DeepSeek++ APK</h1>
    <p>Click below to download and install</p>
    <a href="/$(basename $APK_FILE)" class="apk-btn">📱 Download APK</a>
    <p><small>Enable "Unknown sources" in settings to install</small></p>
</body>
</html>
EOF

# Start PHP server (if available) or Python
if command -v php &> /dev/null; then
    php -S 0.0.0.0:$PORT -t /tmp &
elif command -v python3 &> /dev/null; then
    cd /tmp && python3 -m http.server $PORT &
else
    echo "⚠️ Neither PHP nor Python found, using netcat"
    while true; do
        echo -e "HTTP/1.1 200 OK\n\n$(cat /tmp/apk-share.html)" | nc -l -p $PORT -q 1
    done &
fi

SERVER_PID=$!

# Copy APK to temp directory
cp "$APK_FILE" /tmp/

echo "✅ Server running (PID: $SERVER_PID)"
wait $SERVER_PID
