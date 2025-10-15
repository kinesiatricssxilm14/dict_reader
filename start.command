#!/bin/zsh
set -e

# 进入脚本所在目录
cd "$(dirname "$0")"

# 端口可通过第一个参数传入，默认 8000
PORT=${1:-8000}

if command -v python3 >/dev/null 2>&1; then
  echo "[启动] 使用 python3 在端口 $PORT 启动本地服务器"
  python3 -m http.server "$PORT" &
elif command -v python >/dev/null 2>&1; then
  echo "[启动] 检测到 python（非3），尝试旧版 SimpleHTTPServer"
  python -m SimpleHTTPServer "$PORT" &
else
  echo "未检测到 Python。请安装 Python3，或在终端运行：python3 -m http.server 8000"
  exit 1
fi

sleep 1
echo "[打开] http://localhost:$PORT/"
open "http://localhost:$PORT/"