#!/usr/bin/env bash
# scripts/verify_feed_fix.sh — R0 验收三条：
#   ① feed_log 不再写入 404 / UNKNOWN_SPORT / /scores/ 错误
#   ② open bets 数量随观察窗口递减（auto-settle 恢复）
#   ③ the-odds-api 月度请求 ≤ 450（按 feed_log 时间窗推算）
#
# 用法（bhs-4 上，repo 根目录）：
#   bash scripts/verify_feed_fix.sh [--window-min 30]   # 观察窗口 30 分钟（默认）
#   bash scripts/verify_feed_fix.sh --once             # 单次检查（不循环，适合调试）
#
# 退出码：
#   0 — 三条全过
#   1 — 任一条失败
#   2 — 参数 / DB / 前置缺失

set -uo pipefail

REPO_DIR="${REPO_DIR:-$HOME/services/betting-system}"
DB_PATH="${DB_PATH:-$REPO_DIR/data/betting.db}"
WINDOW_MIN=30
ONCE=0
QUOTA_LIMIT=450

for arg in "$@"; do
  case "$arg" in
    --window-min) WINDOW_MIN="$2"; shift 2 ;;
    --window-min=*) WINDOW_MIN="${arg#*=}"; shift ;;
    --once) ONCE=1 ;;
    --quota-limit) QUOTA_LIMIT="$2"; shift 2 ;;
    -h|--help) sed -n '2,16p' "$0"; exit 0 ;;
    *) echo "unknown arg: $arg"; exit 2 ;;
  esac
done

[[ -f "$DB_PATH" ]] || { echo "DB not found: $DB_PATH"; exit 2; }
command -v sqlite3 >/dev/null || { echo "sqlite3 not installed"; exit 2; }

TS=$(date +%s)
START_TS=$((TS - WINDOW_MIN * 60))
SINCE=$(date -d "@$START_TS" -Iseconds 2>/dev/null || date -r "$START_TS" -Iseconds)

pass=0
fail=0
banner() { echo; echo "── $* ──"; }

# ── ① feed_log 错误模式扫描（按 SINCE 时间窗）
banner "[1/3] feed_log 错误模式（since=$SINCE, window=${WINDOW_MIN}m）"
ERROR_COUNT=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM feed_log
  WHERE requested_at >= '$SINCE'
    AND (
      errors LIKE '%404%'
      OR errors LIKE '%UNKNOWN_SPORT%'
      OR errors LIKE '%/scores/%'
      OR errors LIKE '%upcoming%'
    )")
TOTAL=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM feed_log WHERE requested_at >= '$SINCE'")
echo "  feed_log 总行数: $TOTAL"
echo "  错误模式命中:    $ERROR_COUNT"
if [[ "$ERROR_COUNT" -eq 0 ]]; then
  echo "  ✅ PASS：观察窗口内无 404 / UNKNOWN_SPORT / /scores/ 错误"
  pass=$((pass+1))
else
  echo "  ❌ FAIL：仍有错误，请看样本："
  sqlite3 "$DB_PATH" "SELECT requested_at, errors FROM feed_log
    WHERE requested_at >= '$SINCE' AND (
      errors LIKE '%404%' OR errors LIKE '%UNKNOWN_SPORT%'
      OR errors LIKE '%/scores/%' OR errors LIKE '%upcoming%'
    ) ORDER BY requested_at DESC LIMIT 5"
  fail=$((fail+1))
fi

# ── ② open bets 减少速率（auto-settle 恢复信号）
banner "[2/3] open bets 趋势（auto-settle 恢复信号）"
OPEN_BETS_NOW=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM bets WHERE status='open'")
OPEN_BETS_5MIN_AGO=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM bets
  WHERE status='open' AND created_at < datetime('now','-5 minutes')")
echo "  当前 open bets:  $OPEN_BETS_NOW"
echo "  5 分钟前 open bets（已 settle 部分应从这数字消失）: $OPEN_BETS_5MIN_AGO"
# 信号：当前 open < 5 分钟前 OR settle 行数在窗口内 > 0
SETTLED_IN_WINDOW=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM bets
  WHERE status IN ('won','lost') AND settled_at >= '$SINCE'")
echo "  窗口内新结算行数（won+lost）: $SETTLED_IN_WINDOW"
if [[ "$SETTLED_IN_WINDOW" -gt 0 || "$OPEN_BETS_NOW" -lt "$OPEN_BETS_5MIN_AGO" ]]; then
  echo "  ✅ PASS：auto-settle 链路已恢复（有结算动作）"
  pass=$((pass+1))
else
  echo "  ❌ FAIL：窗口内无 settle，可能原因："
  echo "     · scores 仍 0 行（feed 还没拉到 finished 比赛）→ 等下一轮"
  echo "     · feed_auto_settle setting = 0 → sqlite3 $DB_PATH 'SELECT * FROM settings WHERE key=\"feed_auto_settle\";'"
  echo "     · no finished matches in DB（数据真空，正常）"
  fail=$((fail+1))
fi

# ── ③ 额度治理（窗口内推算月度消耗）
banner "[3/3] the-odds-api 额度推算（按窗口外推 30 天）"
REQS_IN_WINDOW=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM feed_log
  WHERE requested_at >= '$SINCE'")
if [[ "$WINDOW_MIN" -gt 0 ]]; then
  PROJECTED_MONTHLY=$(awk -v r="$REQS_IN_WINDOW" -v w="$WINDOW_MIN" \
    'BEGIN { printf "%.0f", r * (30 * 24 * 60) / w }')
else
  PROJECTED_MONTHLY=$REQS_IN_WINDOW
fi
echo "  窗口请求数:       $REQS_IN_WINDOW"
echo "  30 天外推:        $PROJECTED_MONTHLY req/月 (quota=$QUOTA_LIMIT)"
if [[ "$PROJECTED_MONTHLY" -le "$QUOTA_LIMIT" ]]; then
  echo "  ✅ PASS：额度达标"
  pass=$((pass+1))
else
  echo "  ⚠️  WARN：超过额度上限 $QUOTA_LIMIT，可调 FEED_SCORES_EVERY / FEED_INTERVAL_MIN"
  fail=$((fail+1))
fi

echo
echo "════════════════════════════════════════"
echo "  R0 验收: pass=$pass fail=$fail"
[[ "$fail" -eq 0 ]] && echo "  🟢 OVERALL: PASS" || echo "  🔴 OVERALL: FAIL"
echo "════════════════════════════════════════"

if [[ "$ONCE" -eq 1 ]]; then
  exit $((fail > 0 ? 1 : 0))
fi

if [[ "$fail" -eq 0 ]]; then
  echo
  echo "✅ R0 验收通过。建议：把 verify_feed_fix.sh 加到 cron 每日 1 次，或人工每 24h 跑一次。"
  exit 0
else
  echo
  echo "❌ R0 未通过。请检查："
  echo "   · pm2 logs betting-feed-worker --lines 100"
  echo "   · SELECT * FROM feed_log ORDER BY requested_at DESC LIMIT 20"
  echo "   · SELECT * FROM settings WHERE key LIKE 'feed_%'"
  exit 1
fi