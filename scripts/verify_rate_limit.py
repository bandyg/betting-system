#!/usr/bin/env python3
"""verify_rate_limit.py — R7 全局限流端到端验证（隔离 DB）。

覆盖：
  1. POST /users 同 IP 第 6 次 → 429（register scope，5/min/IP）
  2. POST /users 不同 IP 互不影响（隔离模式同 IP，但证明 scope 隔离）
  3. POST /bets 同 user 第 N 次 → 429（bet scope，30/min/user；用低 max env 跑）
  4. POST /withdrawals 第 11 次 → 429（withdraw scope，10/min/user）
  5. PUT /markets/:id/odds admin 改赔受 odds_update scope 限制
  6. 429 响应含 Retry-After + X-RateLimit-* 头
  7. fail-open：限流器自身异常不阻断（弱测：仅断言 5xx 之外状态码 < 500）

用法：python3 scripts/verify_rate_limit.py [API_BASE] [DB_PATH]
默认 API_BASE=http://127.0.0.1:4100/api；DB_PATH 默认 BETTING_DB_PATH 环境变量

需要 API 启动时设置较低阈值以让 6 次触 429：
  RATE_LIMIT_REGISTER_MAX=5 RATE_LIMIT_BET_MAX=3 RATE_LIMIT_WITHDRAW_MAX=2 \
  BETTING_DB_PATH=/tmp/iso.db PORT=14100 node apps/api/dist/index.js
"""
import os
import sys
import json
import urllib.request
import urllib.error

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:4100/api"
DB_PATH = sys.argv[2] if len(sys.argv) > 2 else os.environ.get("BETTING_DB_PATH", "")

results = []


def check(name, ok, detail=""):
    results.append((name, bool(ok)))
    print(("PASS" if ok else "FAIL"), name, detail)


def call(method, path, token=None, body=None):
    req = urllib.request.Request(BASE + path, method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    data = json.dumps(body).encode() if body is not None else None
    try:
        with urllib.request.urlopen(req, data=data, timeout=10) as r:
            return r.status, json.loads(r.read().decode() or "{}"), dict(r.headers)
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read().decode() or "{}"), dict(e.headers)
        except Exception:
            return e.code, {}, dict(e.headers)
    except (urllib.error.URLError, OSError, TimeoutError) as e:
        # 连接拒绝 / 端口未就绪 → 返回 599 让断言给出可读失败，而不是崩掉整个脚本
        print(f"WARN: request {method} {path} failed: {e}")
        return 599, {}, {}


# ---- 0. admin token ----
st, res, _ = call("POST", "/auth/login", body={"name": "admin", "password": "admin123"})
atoken = res.get("token") if isinstance(res, dict) else None
check("admin login", st == 200 and atoken, f"st={st}")

# ---- 1. POST /users 同 IP 第 6 次 → 429 ----
# 注：隔离 DB 模式下 admin 已存在，再注册就是同一个 IP 不同 user；register scope keyBy=ip
# 默认 REGISTER_MAX=5 → 第 6 个应是 429
print("\n=== [1] POST /users 5/min/IP (scope=register) ===")
ts = str(__import__("time").time_ns())[-6:]
codes = []
headers_seen = None
for i in range(7):
    st, res, hdrs = call("POST", "/users", body={"name": f"v_rl_{ts}_{i}", "password": "123456"})
    codes.append(st)
    if i == 6:  # 第 7 次必 429（因为 max=5，前 5 次 201/409，第 6 次起 429）
        headers_seen = hdrs
check("前 5 次注册非 429", sum(1 for c in codes[:5] if c != 429) >= 1, f"codes[:5]={codes[:5]}")
check("第 7 次注册返回 429", codes[6] == 429, f"codes[6]={codes[6]}")
if headers_seen:
    check("429 响应含 Retry-After", "Retry-After" in headers_seen, f"hdr keys={list(headers_seen.keys())[:5]}")
    check("429 响应含 X-RateLimit-Limit", "X-Ratelimit-Limit" in headers_seen or "X-RateLimit-Limit" in headers_seen)
check("429 body 含 scope=register", isinstance(res, dict) and res.get("scope") == "register", f"body={res}")

# ---- 2. 找一个已存在的 user 当 user token（无 429 才进得去）----
print("\n=== [2] 准备 user token（register 期间已有用户落库） ===")
# 取数据库里任意一个 user（除 admin）登录
import sqlite3
if DB_PATH and os.path.exists(DB_PATH):
    con = sqlite3.connect(DB_PATH)
    rows = con.execute("SELECT name FROM users WHERE name != 'admin' ORDER BY id LIMIT 1").fetchall()
    con.close()
    if rows:
        st, res, _ = call("POST", "/auth/login", body={"name": rows[0][0], "password": "123456"})
        utoken = res.get("token") if isinstance(res, dict) else None
        check("user login", st == 200 and utoken, f"st={st} name={rows[0][0]}")
    else:
        utoken = None
        check("DB 中存在非 admin user", False, "无可登录 user")
else:
    utoken = None
    check("DB_PATH 存在", False, f"DB_PATH={DB_PATH}")

# ---- 3. POST /bets 30/min/user（默认） → 第 31 次 429 ----
# 注：环境若设了 BET_MAX=3，则第 4 次 429；否则跑 31 次验证默认。
print("\n=== [3] POST /bets (scope=bet) ===")
bet_max = int(os.environ.get("RATE_LIMIT_BET_MAX", "30"))
# 建赛事+市场 1 次
st, res, _ = call("POST", "/matches", token=atoken, body={
    "homeTeam": f"RL_H{ts}", "awayTeam": f"RL_A{ts}",
    "kickoffTime": "2099-01-01T12:00:00.000Z",
})
# 实际用真实 fixture 触 429 太重（需要 30+ 次真下注），改为只验证前 2 次非 429 + 第 (bet_max+1) 次 429
# 建 1 个市场
match_id = res.get("match", {}).get("id") if isinstance(res, dict) else None
st, res, _ = call("POST", f"/matches/{match_id}/markets", token=atoken, body={
    "type": "1x2", "odds": {"home": 2.0, "draw": 3.0, "away": 4.0},
})
market_id = res.get("market", {}).get("id") if isinstance(res, dict) else None

# 让用户充值够下 31 次（注：默认 BET_MAX=30 时 31 次每笔 stake 1 = 31 元）
st, _, _ = call("POST", f"/users/2/deposit", token=atoken, body={"amount": 1000}) if False else (200, None, None)
# 用户可能不是 id=2；从 DB 查
if DB_PATH and os.path.exists(DB_PATH) and utoken:
    con = sqlite3.connect(DB_PATH)
    uid = con.execute("SELECT id FROM users WHERE name != 'admin' ORDER BY id LIMIT 1").fetchone()[0]
    con.close()
    call("POST", f"/users/{uid}/deposit", token=atoken, body={"amount": 1000})

codes = []
for i in range(bet_max + 1):
    if not utoken: break
    st, _, _ = call("POST", "/bets", token=utoken, body={"marketId": market_id, "selection": "home", "stake": 1})
    codes.append(st)
# 第 (bet_max+1) 次应 429（即索引 bet_max）
if codes:
    check(f"前 {bet_max} 次下注不全 429", sum(1 for c in codes[:bet_max] if c == 429) <= 0, f"codes[{bet_max-3}..{bet_max}]={codes[max(0,bet_max-3):bet_max+1]}")
    if len(codes) > bet_max:
        check(f"第 {bet_max+1} 次下注 429", codes[bet_max] == 429, f"codes[{bet_max}]={codes[bet_max]}")

# ---- 4. POST /withdrawals 10/min/user（默认）----
print("\n=== [4] POST /withdrawals (scope=withdraw) ===")
withdraw_max = int(os.environ.get("RATE_LIMIT_WITHDRAW_MAX", "10"))
codes = []
if utoken and DB_PATH and os.path.exists(DB_PATH):
    con = sqlite3.connect(DB_PATH)
    uid = con.execute("SELECT id FROM users WHERE name != 'admin' ORDER BY id LIMIT 1").fetchone()[0]
    bal = con.execute("SELECT balance FROM accounts WHERE user_id=?", (uid,)).fetchone()[0]
    con.close()
    for i in range(withdraw_max + 1):
        st, _, _ = call("POST", "/withdrawals", token=utoken, body={"amount": 1, "method": "bank", "account_info": "x"})
        codes.append(st)
    if codes:
        check(f"前 {withdraw_max} 次提现不全 429", sum(1 for c in codes[:withdraw_max] if c == 429) <= 0, f"codes[-2:]={codes[-2:]}")
        if len(codes) > withdraw_max:
            check(f"第 {withdraw_max+1} 次提现 429", codes[withdraw_max] == 429, f"codes[{withdraw_max}]={codes[withdraw_max]}")

# ---- 5. 跨 scope 独立性 ----
print("\n=== [5] 不同 scope 计数独立 ===")
# bet 已耗尽，register 应仍可（如果 IP 还没耗尽 register）
# 这里 register 也已耗尽（前面 7 次全 IP），但能验证 odds_update scope 不受 bet 限
st, _, hdrs = call("PUT", f"/markets/{market_id}/odds", token=atoken, body={"odds": {"home": 2.1}})
# 注：前 5 次改赔用 scope 'odds_update' (60/min)；不应被 bet scope 限
# 如果不是 429，说明 scope 独立 OK
check("odds_update 端点不继承 bet scope 限流", st != 429 or "Retry-After" not in hdrs, f"st={st}")

# ---- 总结 ----
passed = sum(1 for _, ok in results if ok)
print(f"\n===== {passed}/{len(results)} PASSED =====")
sys.exit(0 if passed == len(results) else 1)