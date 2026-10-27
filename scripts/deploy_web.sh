#!/usr/bin/env bash
# scripts/deploy_web.sh — 部署统一前端（Expo 静态产物）到 serve-web（在 bhs-4 上运行）。
#
# 与 deploy_feed_fix.sh 同约定：幂等、dry-run 默认。
#
# 用法（在 bhs-4 上，repo 根目录）：
#   bash scripts/deploy_web.sh             # dry-run，只打印步骤
#   bash scripts/deploy_web.sh --apply     # git pull + install + expo export -p web + 冒烟
#
# 说明：
#   - serve-web.mjs 每个请求直接读 apps/mobile/dist（Cache-Control: no-cache），
#     产物替换即生效，无需 pm2 restart。
#   - nvm 用户先 `source ~/.nvm/nvm.sh`，否则 pnpm/node 不在 PATH。
#   - 验收：浏览器强刷 bhs-4:4300（Ctrl+F5），页面右侧不再出现滚动条。
set -euo pipefail

REPO_DIR="${REPO_DIR:-$HOME/services/betting-system}"
cd "$REPO_DIR"

command -v git  >/dev/null || { echo "❌ git 不在 PATH"; exit 1; }
command -v pnpm >/dev/null || { echo "❌ pnpm 不在 PATH —— nvm 用户先: source ~/.nvm/nvm.sh"; exit 1; }

APPLY=0
[ "${1:-}" = "--apply" ] && APPLY=1
[ -n "${1:-}" ] && [ "${1:-}" != "--apply" ] && { sed -n '2,18p' "$0"; exit 2; }

log() { echo "[$(date -Iseconds)] $*"; }

log "repo: $REPO_DIR"
log "HEAD: $(git rev-parse --short HEAD) — $(git log -1 --format='%s')"

if [ "$APPLY" -ne 1 ]; then
  log "DRY-RUN：将执行——"
  log "  1) git pull --ff-only origin master"
  log "  2) pnpm install --prefer-offline"
  log "  3) cd apps/mobile && pnpm exec expo export -p web（产物 → apps/mobile/dist）"
  log "  4) 冒烟：curl :4300 / 与 /admin"
  log "dry-run 完成。--apply 实际执行。"
  exit 0
fi

log "[1/4] git pull --ff-only origin master | before=$(git rev-parse --short HEAD)"
git pull --ff-only origin master
log "[1/4] | after=$(git rev-parse --short HEAD)"

log "[2/4] pnpm install --prefer-offline"
pnpm install --prefer-offline 2>&1 | tail -3

log "[3/4] expo export -p web"
cd apps/mobile
pnpm exec expo export -p web 2>&1 | tail -8
test -f dist/index.html || { echo "❌ dist/index.html 未生成，export 失败"; exit 1; }
cd "$REPO_DIR"

log "[4/4] 冒烟验证 :4300"
sleep 1
curl -fsS http://localhost:4300/ >/dev/null && echo "  ✓ / 200"
curl -fsS http://localhost:4300/admin | grep -q '<html' && echo "  ✓ /admin 200"

log "=== 部署完成（serve-web 按请求读盘，无需 pm2 restart；浏览器刷新即见）==="
