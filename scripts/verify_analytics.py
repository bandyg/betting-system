#!/usr/bin/env python3
"""Step 31-34 Data Analytics 端到端验证（可重复执行）

用法: python3 scripts/verify_analytics.py [API_BASE]
默认 API_BASE: http://100.66.5.26:4100/api
断言: dashboard/trends/hot-matches/users 聚合 vs SQLite 手算基线 + 权限矩阵 + 核心下注闭环
"""
import sys
import json
import os
import sqlite3
import urllib.request

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://100.66.5.26:4100/api"
DB = os.path.expanduser("~/services/betting-system/data/betting.db")


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


# 1. 手算 SQL 基线
con = sqlite3.connect(DB)
cur = con.cursor()
ref_stake = cur.execute("SELECT COALESCE(SUM(stake),0) FROM bets").fetchone()[0]
ref_bets = cur.execute("SELECT COUNT(*) FROM bets").fetchone()[0]
ref_payout = cur.execute("SELECT COALESCE(SUM(amount),0) FROM transactions WHERE type='payout'").fetchone()[0]
ref_deposit = cur.execute("SELECT COALESCE(SUM(amount),0) FROM transactions WHERE type='deposit'").fetchone()[0]
ref_active = cur.execute("SELECT COUNT(DISTINCT user_id) FROM bets").fetchone()[0]
ref_users = cur.execute("SELECT COUNT(*) FROM users").fetchone()[0]
con.close()
print(f"REF: stake={ref_stake} bets={ref_bets} payout={ref_payout} deposit={ref_deposit} active={ref_active} users={ref_users}")

# 2. admin token
st, res = call("POST", "/auth/login", body={"name": "admin", "password": "admin123"})
atoken = res.get("token")
check("admin login", st == 200 and atoken, f"st={st}")

# 3. dashboard 一致性
st, res = call("GET", "/analytics/dashboard", token=atoken)
d = res.get("dashboard", {})
check("dashboard 200", st == 200)
check("dashboard stake==REF", abs(d.get("totalBetStake", -1) - round(ref_stake, 2)) < 0.01)
check("dashboard bets==REF", d.get("totalBets") == ref_bets)
check("dashboard payout==REF", abs(d.get("totalPayout", -1) - round(ref_payout, 2)) < 0.01)
check("dashboard deposits==REF", abs(d.get("totalDeposits", -1) - round(ref_deposit, 2)) < 0.01)
check("dashboard active==REF", d.get("activeUsers") == ref_active)
check("dashboard users==REF", d.get("totalUsers") == ref_users)
check("netRevenue = stake-payout", abs(d.get("netRevenue", 0) - (round(ref_stake, 2) - round(ref_payout, 2))) < 0.01)

# 4. trends
st, res = call("GET", "/analytics/trends?days=14", token=atoken)
tr = res.get("trends", [])
check("trends 200 & 14 points", st == 200 and len(tr) == 14, f"len={len(tr)}")
check("trends dates continuous", all(tr[i + 1]["date"] > tr[i]["date"] for i in range(len(tr) - 1)))
con = sqlite3.connect(DB)
cur = con.cursor()
d16 = cur.execute("SELECT COALESCE(SUM(stake),0), COUNT(*) FROM bets WHERE date(created_at)=date('now')").fetchone()
con.close()
check("trends today stake==REF", abs(tr[-1]["stake"] - round(d16[0], 2)) < 0.01)

# 5. hot-matches
con = sqlite3.connect(DB)
cur = con.cursor()
rows = cur.execute(
    """SELECT m.id, m.home_team, m.away_team, COALESCE(SUM(b.stake),0), COUNT(b.id)
     FROM matches m LEFT JOIN markets mk ON mk.match_id=m.id LEFT JOIN bets b ON b.market_id=mk.id
     GROUP BY m.id ORDER BY 4 DESC LIMIT 5"""
).fetchall()
con.close()
st, res = call("GET", "/analytics/hot-matches?limit=5", token=atoken)
hm = res.get("matches", [])
check("hot-matches 200 & 5 rows", st == 200 and len(hm) == 5)
check("hot-matches top1 == REF", hm[0]["matchId"] == rows[0][0] and abs(hm[0]["stake"] - round(rows[0][3], 2)) < 0.01)

# 6. users
con = sqlite3.connect(DB)
cur = con.cursor()
urows = cur.execute(
    """SELECT u.id, u.name, COALESCE(SUM(b.stake),0), COUNT(b.id)
     FROM users u LEFT JOIN bets b ON b.user_id=u.id GROUP BY u.id ORDER BY 3 DESC LIMIT 5"""
).fetchall()
con.close()
st, res = call("GET", "/analytics/users?limit=5", token=atoken)
ul = res.get("users", [])
check("users 200 & 5 rows", st == 200 and len(ul) == 5)
check("users top1 == REF", ul[0]["userId"] == urows[0][0] and abs(ul[0]["stake"] - round(urows[0][2], 2)) < 0.01)

# 7. 权限矩阵
st, _ = call("GET", "/analytics/dashboard")
check("anon 401", st == 401, f"st={st}")
st, res = call("POST", "/auth/login", body={"name": "webdemo2", "password": "123456"})
utok = res.get("token")
st, _ = call("GET", "/analytics/dashboard", token=utok)
check("normal user 403", st == 403, f"st={st}")

# 8. 核心闭环回归
st, res = call("GET", "/matches", token=atoken)
open_mk = None
for m in res.get("matches", []):
    for mk in m.get("markets", []):
        if mk.get("status") == "open" and mk.get("odds"):
            open_mk = mk
            break
    if open_mk:
        break
if open_mk:
    sel = open_mk["odds"][0]["selection"]
    st, res = call("POST", "/bets", token=utok, body={"marketId": open_mk["id"], "selection": sel, "stake": 10})
    check("core bet 201", st == 201)
else:
    check("core bet 201", False, "no open market found")

passed = sum(1 for _, ok in results if ok)
print(f"\n===== {passed}/{len(results)} PASSED =====")
sys.exit(0 if passed == len(results) else 1)
