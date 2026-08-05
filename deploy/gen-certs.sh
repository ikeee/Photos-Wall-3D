#!/usr/bin/env bash
# 生成自签 HTTPS 证书（局域网测试摄像头用）
# 用法: bash deploy/gen-certs.sh [本机IP]
set -euo pipefail
IP="${1:-$(hostname -I | awk '{print $1}')}"
DIR="$(cd "$(dirname "$0")" && pwd)/certs"
mkdir -p "$DIR"
openssl req -x509 -newkey rsa:2048 \
  -keyout "$DIR/key.pem" -out "$DIR/cert.pem" \
  -days 825 -nodes \
  -subj "/CN=orangepi5pro" \
  -addext "subjectAltName=IP:${IP},DNS:orangepi5pro"
echo "✅ 证书已生成: $DIR/cert.pem（SAN: IP:${IP}）"
echo "重启后端生效: sudo systemctl restart photos-wall 或 node server.mjs"
