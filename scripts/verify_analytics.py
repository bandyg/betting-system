#!/usr/bin/env python3
"""Step 31-34 Data Analytics 端到端验证（可重复执行）

支持两种模式：
  1. 隔离 DB 模式（默认，CI 推荐）：BETTING_DB_PATH 或 DB 指向空库 → 脚本自己建用户/赛事/下注，
     然后断言聚合值与手算一致
  2. 生产 DB 模式（不指定 DB 时）：直接对生产 DB REF 校验 + 权限矩阵

用法: python3 scripts/verify_analytics.py [API_BASE] [DB_PATH]
默认 API_BASE: http://127.0.0.1:4100/api
"""
import sys
import json
import os
import sqlite3
import urllib.request
import urllib.error

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:4100/api"
DB = (
    sys.argv[2]
    if len(sys.argv) > 2
    else os.environ.get("BETTING_DB_PATH", os.path.expanduser("~/services/betting-system/data/betting.db"))
)


def call(method, path, token=None, body=None):
    req = urllib.request.Request(BASE + path, method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    data = json.dumps(body).encode() if body is not None else None
    try:
        with urllib.request.urlopen(req, data=data, timeout=15) as r:
            return r.status, json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read().decode())
        except Exception:
            return e.code, {}


results = []


def check(name, cond, detail=""):
    results.append((name, bool(cond)))
    print(("PASS" if cond else "FAIL"), name, detail)


# 1. 探测 DB 模式：隔离 DB vs 生产 DB
is_isolated = False
if os.path.exists(DB):
    con = sqlite3.connect(DB)
    user_count = con.execute("SELECT COUNT(*) FROM users").fetchone()[0]
    bet_count = con.execute("SELECT COUNT(*) FROM bets").fetchone()[0]
    con.close()
    # 隔离 DB 启发：用户数 <= 3（admin + 默认生成的） 且 投注数 == 0
    if user_count <= 3 and bet_count == 0:
        is_isolated = True

print(f"MODE: {'isolated (self-check)' if is_isolated else 'production (REF check)'} (users={user_count if os.path.exists(DB) else 'N/A'}, bets={bet_count if os.path.exists(DB) else 'N/A'})")

# 2. admin token
st, res = call("POST", "/auth/login", body={"name": "admin", "password": "admin123"})
atoken = res.get("token") if isinstance(res, dict) else None
check("admin login", st == 200 and atoken, f"st={st}")

# 用于权限矩阵测试的普通用户 token（隔离/生产模式共用，末尾变量）
utoken = None

if is_isolated:
    # ===== 隔离模式：自助对账 =====
    ts = str(__import__("time").time_ns())[-6:]

    # 创建测试用户 + 充 500
    st, res = call("POST", "/users", body={"name": f"v_ana_{ts}", "password": "123456"})
    check("建用户 → 201", st == 201)
    user_id = res.get("user", {}).get("id") if isinstance(res, dict) else None

    st, res = call("POST", "/auth/login", body={"name": f"v_ana_{ts}", "password": "123456"})
    utoken = res.get("token") if isinstance(res, dict) else None

    st, _ = call("POST", f"/users/{user_id}/deposit", token=atoken, body={"amount": 500})
    check("admin 充值 500 → 200", st == 200)

    # 建赛事 + 市场
    st, res = call("POST", "/matches", token=atoken, body={
        "homeTeam": f"AnaH{ts}", "awayTeam": f"AnaA{ts}",
        "kickoffTime": "2099-01-01T12:00:00.000Z", "sport": "soccer", "league": "AnaLeague",
    })
    check("建赛事 → 201", st == 201)
    match_id = res.get("match", {}).get("id") if isinstance(res, dict) else None

    st, res = call("POST", f"/matches/{match_id}/markets", token=atoken, body={
        "type": "1x2", "line": None, "odds": {"home": 2.0, "draw": 3.0, "away": 4.0},
    })
    check("建 1x2 市场 → 201", st == 201)
    market_id = res.get("market", {}).get("id") if isinstance(res, dict) else None

    # 下注 100 + 50
    st, _ = call("POST", "/bets", token=utoken, body={"marketId": market_id, "selection": "home", "stake": 100})
    check("下注 100 → 201", st == 201)
    st, _ = call("POST", "/bets", token=utoken, body={"marketId": market_id, "selection": "away", "stake": 50})
    check("下注 50 → 201", st == 201)

    # 预期值自助对账
    EXPECTED_STAKE = 150
    EXPECTED_BETS = 2
    EXPECTED_DEPOSIT = 500
    EXPECTED_ACTIVE = 1
    EXPECTED_PAYOUT = 0  # 自助对账：未结算
    # EXPECTED_USERS 在跑完后基于 DB 实际值断言（"≥2"）
else:
    # ===== 生产模式：直接 REF 校验 =====
    con = sqlite3.connect(DB)
    EXPECTED_STAKE = con.execute("SELECT COALESCE(SUM(stake),0) FROM bets").fetchone()[0]
    EXPECTED_BETS = con.execute("SELECT COUNT(*) FROM bets").fetchone()[0]
    EXPECTED_DEPOSIT = con.execute("SELECT COALESCE(SUM(amount),0) FROM transactions WHERE type='deposit'").fetchone()[0]
    EXPECTED_USERS = con.execute("SELECT COUNT(*) FROM users").fetchone()[0]
    EXPECTED_ACTIVE = con.execute("SELECT COUNT(DISTINCT user_id) FROM bets").fetchone()[0]
    EXPECTED_PAYOUT = con.execute("SELECT COALESCE(SUM(amount),0) FROM transactions WHERE type='payout'").fetchone()[0]
    con.close()
    print(f"REF: stake={EXPECTED_STAKE} bets={EXPECTED_BETS} deposit={EXPECTED_DEPOSIT} users={EXPECTED_USERS} active={EXPECTED_ACTIVE} payout={EXPECTED_PAYOUT}")

    # 生产模式：随便登录一个 user 用于权限测试（admin 不能测 403；先尝试任意 user）
    # 选当前 users 表第一个非 admin 用户
    con = sqlite3.connect(DB)
    rows = con.execute("SELECT name FROM users WHERE name != 'admin' ORDER BY id LIMIT 1").fetchall()
    con.close()
    if rows:
        st, res = call("POST", "/auth/login", body={"name": rows[0][0], "password": "123456"})
        utoken = res.get("token") if isinstance(res, dict) else None

# 3. dashboard 一致性
st, res = call("GET", "/analytics/dashboard", token=atoken)
d = res.get("dashboard", {}) if isinstance(res, dict) else {}
check("dashboard 200", st == 200)
check("dashboard stake==EXP", abs(d.get("totalBetStake", -1) - round(EXPECTED_STAKE, 2)) < 0.01,
      f"got={d.get('totalBetStake')} exp={round(EXPECTED_STAKE,2)}")
check("dashboard bets==EXP", d.get("totalBets") == EXPECTED_BETS,
      f"got={d.get('totalBets')} exp={EXPECTED_BETS}")
check("dashboard deposits==EXP", abs(d.get("totalDeposits", -1) - round(EXPECTED_DEPOSIT, 2)) < 0.01,
      f"got={d.get('totalDeposits')} exp={round(EXPECTED_DEPOSIT,2)}")
# 隔离模式：DB 可能已被前面 verify_* 脚本写入了其他 user，无法精确断言 user 总数
# 改成断言"至少 2 个 user (admin + 1 新建)"
if is_isolated:
    check("dashboard users >= 2 (admin + 新建)", d.get("totalUsers", 0) >= 2, f"got={d.get('totalUsers')}")
else:
    check("dashboard users==EXP", d.get("totalUsers") == EXPECTED_USERS, f"got={d.get('totalUsers')} exp={EXPECTED_USERS}")
check("dashboard active==EXP", d.get("activeUsers") == EXPECTED_ACTIVE,
      f"got={d.get('activeUsers')} exp={EXPECTED_ACTIVE}")
EXPECTED_NET = round(EXPECTED_STAKE - EXPECTED_PAYOUT, 2)  # 未结算 = 0 payout (其他类型会被减)
check("netRevenue = stake-payout (no settle yet)",
      abs(d.get("netRevenue", 0) - EXPECTED_NET) < 0.01,
      f"got={d.get('netRevenue')} exp={EXPECTED_NET}")

# 4. trends
st, res = call("GET", "/analytics/trends?days=14", token=atoken)
tr = res.get("trends", []) if isinstance(res, dict) else []
check("trends 200 & 14 points", st == 200 and len(tr) == 14, f"len={len(tr)}")
check("trends dates continuous", all(tr[i + 1]["date"] > tr[i]["date"] for i in range(len(tr) - 1)))
# trends today stake
con = sqlite3.connect(DB) if os.path.exists(DB) else None
if con:
    d_today = con.execute("SELECT COALESCE(SUM(stake),0) FROM bets WHERE date(created_at)=date('now')").fetchone()[0]
    con.close()
    check("trends today stake==EXP", abs(tr[-1]["stake"] - round(d_today, 2)) < 0.01,
          f"got={tr[-1]['stake']} exp={round(d_today,2)}")

# 5. hot-matches（隔离模式至少 1 行，生产模式 5 行）
st, res = call("GET", "/analytics/hot-matches?limit=5", token=atoken)
hm = res.get("matches", []) if isinstance(res, dict) else []
expected_hm = 1 if is_isolated else 5
check(f"hot-matches 200", st == 200)
# 隔离模式：至少有 1 个 hot-match（自建）
# 生产模式：至少有 1 个（hot-match SQL 总返回 LEFT JOIN 全部 match，即使 0 投注）
check(f"hot-matches has rows", len(hm) >= 1, f"got={len(hm)}")
if hm:
    top = hm[0]
    check("hot-matches top1 has matchId+stake+bets", "matchId" in top and "stake" in top and "bets" in top,
          f"top={top}")

# 6. users
st, res = call("GET", "/analytics/users?limit=5", token=atoken)
ul = res.get("users", []) if isinstance(res, dict) else []
check("users 200", st == 200)
check("users has rows", len(ul) >= 1, f"got={len(ul)}")
if ul:
    top = ul[0]
    check("users top1 has userId+stake+bets", "userId" in top and "stake" in top and "bets" in top,
          f"top={top}")

# 7. 权限矩阵
st, _ = call("GET", "/analytics/dashboard")
check("anon 401", st == 401, f"st={st}")

# 用当前新建的 user token 测 403
st, res = call("GET", "/analytics/dashboard", token=utoken)
check("normal user 403", st == 403, f"st={st}")

passed = sum(1 for _, ok in results if ok)
print(f"\n===== {passed}/{len(results)} PASSED =====")
sys.exit(0 if passed == len(results) else 1)
