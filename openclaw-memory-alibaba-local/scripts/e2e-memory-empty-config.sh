#!/usr/bin/env bash
set -euo pipefail
LANCEDB_DIR="${OPENCLAW_STATE_DIR:-$HOME/.openclaw}/memory/lancedb"
rm -rf "$LANCEDB_DIR/openclaw_memories_alibaba_local.lance"
rm -f "$LANCEDB_DIR"/memory-alibaba-local-*.json 2>/dev/null || true
echo "[e2e] dropped table + cursors under $LANCEDB_DIR"

openclaw gateway restart
sleep 4

TOKEN="$(node -e "console.log(JSON.parse(require('fs').readFileSync(require('path').join(process.env.HOME,'.openclaw/openclaw.json'),'utf8')).gateway.auth.token)")"
SID="mem-empty-$(date +%s)"
echo "[e2e] session=$SID"

for i in 1 2 3 4 5; do
  echo "=== agent turn $i ==="
  openclaw agent --session-id "$SID" --timeout 180 -m "第${i}轮：请记住我喜欢用青色做调试高亮，这是第${i}次说明。" 2>&1 | tail -8
done

echo "=== API user tab ==="
curl -sS "http://127.0.0.1:12345/plugins/memory/api/list?agentId=main&sessionId=session%3A${SID}&tab=user&page=1&limit=20" \
  -H "Authorization: Bearer ${TOKEN}" | head -c 4000
echo
echo "=== API full tab ==="
curl -sS "http://127.0.0.1:12345/plugins/memory/api/list?agentId=main&sessionId=session%3A${SID}&tab=full&page=1&limit=40" \
  -H "Authorization: Bearer ${TOKEN}" | head -c 4000
echo
echo "[e2e] done"
