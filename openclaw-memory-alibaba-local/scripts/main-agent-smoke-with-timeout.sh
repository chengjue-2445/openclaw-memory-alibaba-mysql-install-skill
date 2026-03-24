#!/usr/bin/env bash
# 修改插件后：先重启 Gateway（见仓库 .cursor/rules/openclaw-memory-plugin-restart.mdc），再跑 main agent，限时避免挂死。
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> openclaw gateway restart (加载插件)"
npx openclaw gateway restart

MSG="${1:-我记得测试召回用的口令是钴蓝九号}"
SECONDS="${2:-30}"
STATE_DIR="${OPENCLAW_STATE_DIR:-$HOME/.openclaw}"
LOG_FILE="$STATE_DIR/logs/gateway.log"

echo "==> openclaw agent --local --agent main (timeout ${SECONDS}s)"
echo "    message: $MSG"
export OPENCLAW_LOG_LEVEL="${OPENCLAW_LOG_LEVEL:-info}"

# macOS 无 GNU timeout 时用 Python 包一层
python3 - "$SECONDS" "$MSG" <<'PY'
import os, subprocess, sys
sec = int(sys.argv[1])
msg = sys.argv[2]
cmd = ["npx", "openclaw", "agent", "--local", "--agent", "main", "-m", msg, "--json"]
try:
    p = subprocess.run(cmd, timeout=sec)
    sys.exit(p.returncode)
except subprocess.TimeoutExpired:
    print(f"\n[smoke] agent 超过 {sec}s 已中断（exit 124）", file=sys.stderr)
    sys.exit(124)
PY

echo ""
echo "==> 最近 recall 相关日志 ($LOG_FILE)"
if [[ -f "$LOG_FILE" ]]; then
  grep -E "recallQueryExtract|recall skip|openclaw-memory-alibaba-local: recall timing" "$LOG_FILE" | tail -n 15 || true
else
  echo "    (无此文件，检查 OPENCLAW_STATE_DIR)"
fi
