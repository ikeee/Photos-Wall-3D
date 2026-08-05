#!/bin/bash
# 电源/稳定性监控：每分钟记录系统状态 + 开机标记，重启后用于排查崩溃时刻
# 用法: power-watch.sh [boot]
LOG=/home/orangepi/.openclaw/workspace/memory/power-watch.log
if [ "$1" = "boot" ]; then
  echo "BOOT $(date '+%F %T')" >> "$LOG"
else
  echo "$(date '+%F %T') up=$(uptime -p | tr -d ' ') load=$(cut -d' ' -f1-3 /proc/loadavg) temp=$(cat /sys/class/thermal/thermal_zone0/temp) mem=$(free -m | awk '/Mem:/{print $3"/"$2"MB"}')" >> "$LOG"
fi
