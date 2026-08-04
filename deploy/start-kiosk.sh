#!/usr/bin/env bash
# 照片墙 kiosk 启动脚本：Chromium 全屏展示，崩溃自动重启
# 用法: ./start-kiosk.sh [URL]   （默认 http://127.0.0.1:8787/）
set -e
URL="${1:-http://127.0.0.1:8787/}"
CHROME_BIN="${CHROME_BIN:-chromium-browser}"
PROFILE="${PROFILE:-$HOME/.pw3d-chromium}"

while true; do
  "$CHROME_BIN" \
    --kiosk --start-fullscreen \
    --noerrdialogs --disable-infobars --disable-session-crashed-bubble \
    --no-first-run --disable-default-apps --check-for-update-interval=31536000 \
    --use-gl=egl --ignore-gpu-blocklist --disable-gpu-sandbox \
    --autoplay-policy=no-user-gesture-required --disable-dev-shm-usage \
    --user-data-dir="$PROFILE" \
    "$URL"
  echo "[kiosk] chromium 退出，2s 后重启"
  sleep 2
done
