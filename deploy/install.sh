#!/usr/bin/env bash
# 照片墙安装/卸载脚本
# 用法: ./install.sh [backend|kiosk|all|uninstall]
#   backend - 后端注册为 systemd 服务（开机自启，推荐）
#   kiosk   - kiosk 全屏展示加入登录自启动（默认不装，测试通过后再装）
#   all     - 两者都装
set -euo pipefail
REPO="$(cd "$(dirname "$0")/.." && pwd)"
SERVICE=photos-wall.service
KIOSK_DESKTOP=photos-wall-kiosk.desktop
AUTOSTART_DIR="$HOME/.config/autostart"

install_backend() {
  echo "==> 安装后端 systemd 服务"
  sudo cp "$REPO/deploy/$SERVICE" /etc/systemd/system/
  sudo systemctl daemon-reload
  sudo systemctl enable "$SERVICE"
  sudo systemctl restart "$SERVICE"
  sleep 1
  if curl -s -o /dev/null http://127.0.0.1:8787/; then
    echo "    ✅ 后端已运行: http://<本机IP>:8787"
    echo "    管理后台: #/admin  Token: $(cat "$REPO/data/.admin_token" 2>/dev/null || echo '见 data/.admin_token')"
  else
    echo "    ❌ 启动失败，查看: journalctl -u $SERVICE -n 50"
  fi
}

install_kiosk() {
  echo "==> 安装 kiosk 登录自启"
  mkdir -p "$AUTOSTART_DIR"
  cp "$REPO/deploy/$KIOSK_DESKTOP" "$AUTOSTART_DIR/"
  echo "    下次登录自动全屏启动；立即测试: DISPLAY=:0 $REPO/deploy/start-kiosk.sh &"
}

uninstall() {
  sudo systemctl disable --now "$SERVICE" 2>/dev/null || true
  rm -f "$AUTOSTART_DIR/$KIOSK_DESKTOP"
  echo "已卸载"
}

case "${1:-backend}" in
  backend) install_backend ;;
  kiosk)   install_kiosk ;;
  all)     install_backend; install_kiosk ;;
  uninstall) uninstall ;;
  *) echo "用法: $0 [backend|kiosk|all|uninstall]"; exit 1 ;;
esac
