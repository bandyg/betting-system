#!/usr/bin/env bash
# scripts/deploy_feed_fix.sh — R0 部署 feed-scores-fix 到 bhs-4。
#
# 设计原则：幂等、dry-run 默认、可被同一脚本回滚、零网络依赖（git pull over SSH 假设已配）。
#
# 用法（在 bhs-4 上，repo 根目录运行）：
#   bash scripts/deploy_feed_fix.sh                  # 全程 dry-run，只打印不执行
#   bash scripts/deploy_feed_fix.sh --apply          # 实际 git pull + build + pm2 restart
#   bash scripts/deploy_feed_fix.sh --rollback       # 回滚到上一个 green commit（用 reflog 倒数第二条）
#
# 前置：
#   - 服务路径：$REPO_DIR（默认 ~/services/betting-system）
#   - pm2 已装：betting-api / betting-feed-worker 两个 process
#   - 数据库：data/betting.db（自动备份）
#
# 验收（run scripts/verify_feed_fix.sh 后）：
#   1. feed_log 不再写入 'UNKNOWN_SPORT' 或 '/scores/' 404
#   2. feed_auto_settle 恢复，open bets 开始结算
#   3. the-odds-api 月度消耗 ≤ 450 req

set -euo pipefail

REPO_DIR="${REPO_DIR:-$HOME/services/betting-system}"
DB_PATH_DEFAULT="$REPO_DIR/data/betting.db"
DB_BACKUP_DIR="$REPO_DIR/data/.bak"
LOG_FILE="$REPO_DIR/.scratch/deploy_feed_fix.log"

APPLY=0
ROLLBACK=0
for arg in "$@"; do
  case "$arg" in
    --apply) APPLY=1 ;;
    --rollback) ROLLBACK=1 ;;
    -h|--help) sed -n '2,17p' "$0"; exit 0 ;;
    *) echo "unknown arg: $arg"; exit 2 ;;
  esac
done

log() { echo "[$(date -Iseconds)] $*" | tee -a "$LOG_FILE"; }

cd "$REPO_DIR"
mkdir -p "$(dirname "$LOG_FILE")" "$DB_BACKUP_DIR"

if [[ $ROLLBACK -eq 1 ]]; then
  log "ROLLBACK 模式：从 reflog 选倒数第二条"
  TARGET=$(git reflog | awk '/checkout|reset/ {print $1}' | head -1 || true)
  # reflog 里 reset/checkout 不直接记录 SHA；用 HEAD@{2}（两条前的稳定点）
  git reset --hard HEAD@{2} 2>/dev/null || git reset --hard HEAD~1
  log "已 reset 到 $(git rev-parse --short HEAD)"
  cd apps/api && pnpm build 2>&1 | tail -5
  cd "$REPO_DIR"
  pm2 restart betting-feed-worker betting-api --silent || true
  log "rollback 完成（旧 fix 状态）；建议手动观察 30 min 确认 feed_log 行为"
  exit 0
fi

log "=== deploy_feed_fix.sh 启动 (apply=$APPLY) ==="
log "repo:    $REPO_DIR"
log "commit:  $(git rev-parse --short HEAD) — $(git log -1 --format='%s')"

# 防御：commit message 必须含 'feed-scores-fix' 或 'feed:'
if ! git log -1 --format='%s' | grep -qE "feed-scores-fix|feed: scores"; then
  log "⚠️  最新 commit 不是 feed-scores-fix，已是别的。请确认是不是漏拉。"
fi

# 防御：DB 必须在新版本 schema（含 match_feed_key 列）
DB_PATH="$REPO_DIR/data/betting.db"
if [[ -f "$DB_PATH" ]] && command -v sqlite3 >/dev/null; then
  HAS_COL=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM pragma_table_info('matches') WHERE name='match_feed_key'" 2>/dev/null || echo "0")
  if [[ "$HAS_COL" -eq 0 ]]; then
    log "⚠️  matches.match_feed_key 列不存在 — 老部署？API 启动时会自动 ALTER，无需手动处理"
  fi
fi

if [[ $APPLY -ne 1 ]]; then
  log "DRY-RUN：将执行——"
  log "  1) git pull --ff-only origin master"
  log "  2) cp $DB_PATH_DEFAULT $DB_BACKUP_DIR/betting.db.$(date +%Y%m%d-%H%M%S)-pre-feed-fix"
  log "  3) cd apps/api && pnpm build"
  log "  4) pm2 restart betting-feed-worker betting-api"
  log "  5) tail -50 .pm2/logs/betting-feed-worker-out.log  (验证启动)"
  log "DRY-RUN 完成。用 --apply 实际执行。"
  exit 0
fi

log "[1/5] git pull --ff-only origin master | before=$(git rev-parse --short HEAD)"
git pull --ff-only origin master
log "[1/5] | after=$(git rev-parse --short HEAD)"

log "[2/5] 备份生产 DB → $DB_BACKUP_DIR"
TS=$(date +%Y%m%d-%H%M%S)
if [[ -f "$DB_PATH" ]]; then
  cp -p "$DB_PATH" "$DB_BACKUP_DIR/betting.db.${TS}-pre-feed-fix"
  log "  ✓ 备份 $(stat -c %s "$DB_BACKUP_DIR/betting.db.${TS}-pre-feed-fix" 2>/dev/null || ls -la "$DB_BACKUP_DIR/betting.db.${TS}-pre-feed-fix" | awk '{print $5}') bytes"
else
  log "  ! 未找到 $DB_PATH，跳过备份"
fi

log "[3/5] pnpm build (apps/api)"
cd apps/api
pnpm install --prefer-offline 2>&1 | tail -3
pnpm build 2>&1 | tail -10
cd "$REPO_DIR"

log "[4/5] 重启 feed-worker + api"
pm2 restart betting-feed-worker --silent
pm2 restart betting-api --silent
sleep 2
pm2 status betting-feed-worker betting-api | head -6

log "[5/5] feed-worker 启动日志（最近 50 行）"
pm2 logs betting-feed-worker --lines 50 --nostream --silent 2>&1 | tail -30 || \
  tail -50 "$HOME/.pm2/logs/betting-feed-worker-out.log" 2>/dev/null || true

log "=== 部署完成 ==="
log "下一步：bash scripts/verify_feed_fix.sh   （含 30 分钟观察窗口）"