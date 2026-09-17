#!/usr/bin/env python3
"""verify_matches.py — matches.ts 端到端验证（2026-09-17，feature/verify-core-routes）

验证目标（PRD §3 matches.ts）：
  1. POST /matches：admin 201 + 含 sport/league；非 admin 401/403；缺字段 400；非 ISO 时间 400
  2. GET /matches：空过滤 200；按 sport/league/status 过滤正确
  3. GET /matches/:id：存在 200；不存在 404；非法 id 400
用法:
  python3 scripts/verify_matches.py [API_BASE] [DB_PATH]
"""
import json
import os
import sys
import urllib.request
import urllib.error

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:4100/api"
DB = sys.argv[2] if len(sys.argv) > 2 else os.environ.get("BETTING_DB_PATH", "data/betting.db")

results = []


def check(name, cond, detail=""):
    results.append((name, bool(cond)))
    print(("PASS" if cond else "FAIL"), name, detail)


def call(method, path, token=None, body=None):
    req = urllib.request.Request(BASE + path, method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    data = json.dumps(body).encode() if body is not None else None
    try:
        with urllib.request.urlopen(req, data=data, timeout=10) as r:
            return r.status, json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read().decode())
        except Exception:
            return e.code, {}


def unique(prefix):
    return f"{prefix}_{os.urandom(3).hex()}"


# Login admin
admin_st, admin_res = call("POST", "/auth/login", body={"name": "admin", "password": "admin123"})
if admin_st != 200 or "token" not in admin_res:
    print(f"FAIL: cannot login admin (status={admin_st})")
    sys.exit(1)
admin_token = admin_res["token"]

# Login a normal user (for permission tests)
uname = unique("v_match_user")
st, res = call("POST", "/users", body={"name": uname, "password": "123456"})
if st != 201:
    print(f"FAIL: cannot create normal user (status={st})")
    sys.exit(1)
user_token = res["token"]


# ===== 1. POST /matches =====
print("\n== 1. POST /matches ==")

# 1.1 未登录 → 401
st, _ = call("POST", "/matches", body={"homeTeam": "A", "awayTeam": "B", "kickoffTime": "2027-01-01T00:00:00Z"})
check("未登录 → 401", st == 401, f"st={st}")

# 1.2 非 admin → 403
st, _ = call(
    "POST",
    "/matches",
    token=user_token,
    body={"homeTeam": "A", "awayTeam": "B", "kickoffTime": "2027-01-01T00:00:00Z"},
)
check("非 admin → 403", st == 403, f"st={st}")

# 1.3 缺 homeTeam → 400
st, _ = call(
    "POST",
    "/matches",
    token=admin_token,
    body={"awayTeam": "B", "kickoffTime": "2027-01-01T00:00:00Z"},
)
check("缺 homeTeam → 400", st == 400, f"st={st}")

# 1.4 缺 awayTeam → 400
st, _ = call(
    "POST",
    "/matches",
    token=admin_token,
    body={"homeTeam": "A", "kickoffTime": "2027-01-01T00:00:00Z"},
)
check("缺 awayTeam → 400", st == 400, f"st={st}")

# 1.5 非 ISO 时间 → 400
st, _ = call(
    "POST",
    "/matches",
    token=admin_token,
    body={"homeTeam": "A", "awayTeam": "B", "kickoffTime": "not-a-date"},
)
check("非 ISO 时间 → 400", st == 400, f"st={st}")

# 1.6 admin 正常创建（带 sport/league）→ 201
st, res = call(
    "POST",
    "/matches",
    token=admin_token,
    body={
        "homeTeam": "FC Alpha",
        "awayTeam": "FC Beta",
        "kickoffTime": "2027-01-01T00:00:00Z",
        "sport": "soccer",
        "league": "Test League",
    },
)
m1 = res.get("match") if isinstance(res, dict) else None
ok = (
    st == 201
    and m1 is not None
    and m1["home_team"] == "FC Alpha"
    and m1["away_team"] == "FC Beta"
    and m1["sport"] == "soccer"
    and m1["league"] == "Test League"
    and m1["status"] == "scheduled"
)
check("admin 创建带 sport/league → 201 + 完整字段", ok, f"st={st} m={m1}")
m1_id = m1["id"] if ok else None

# 1.7 admin 正常创建（无 sport/league）→ 201 + sport/league 为 null
st, res = call(
    "POST",
    "/matches",
    token=admin_token,
    body={"homeTeam": "X", "awayTeam": "Y", "kickoffTime": "2027-02-01T00:00:00Z"},
)
m2 = res.get("match") if isinstance(res, dict) else None
ok = st == 201 and m2 is not None and m2["sport"] is None and m2["league"] is None
check("admin 创建无 sport/league → sport/league=null", ok, f"st={st} sport={m2.get('sport') if m2 else 'n/a'}")
m2_id = m2["id"] if ok else None


# ===== 2. GET /matches =====
print("\n== 2. GET /matches ==")

# 2.1 无过滤 → 200 + 含新建的 m1
st, res = call("GET", "/matches")
ok = st == 200 and "matches" in res and any(m["id"] == m1_id for m in res["matches"])
check("无过滤 → 200 + 含 m1", ok, f"st={st} n={res.get('count') if isinstance(res, dict) else 'n/a'}")

# 2.2 按 sport 过滤
st, res = call("GET", "/matches?sport=soccer")
ok = st == 200 and all(m["sport"] == "soccer" for m in res["matches"]) and any(m["id"] == m1_id for m in res["matches"])
check("按 sport=soccer 过滤", ok, f"st={st}")

# 2.3 按 league 过滤
st, res = call("GET", "/matches?league=Test%20League")
ok = st == 200 and any(m["id"] == m1_id for m in res["matches"]) and all(m["league"] == "Test League" for m in res["matches"])
check("按 league 过滤", ok, f"st={st}")

# 2.4 按 status=scheduled 过滤
st, res = call("GET", "/matches?status=scheduled")
ok = st == 200 and all(m["status"] == "scheduled" for m in res["matches"])
check("按 status=scheduled 过滤", ok, f"st={st}")

# 2.5 按 status=finished 过滤（m1/m2 都是 scheduled，应该 0 或不含 m1）
st, res = call("GET", "/matches?status=finished")
ok = st == 200 and not any(m["id"] == m1_id for m in res["matches"])
check("按 status=finished 过滤（不含 m1）", ok, f"st={st}")


# ===== 3. GET /matches/:id =====
print("\n== 3. GET /matches/:id ==")

# 3.1 存在 → 200 + 含 markets 数组（即使为空）
st, res = call("GET", f"/matches/{m1_id}")
m = res.get("match") if isinstance(res, dict) else None
ok = st == 200 and m is not None and m["id"] == m1_id and "markets" in m
check("存在 → 200 + 含 markets[]", ok, f"st={st} keys={list(m.keys()) if m else 'n/a'}")

# 3.2 不存在 → 404
st, _ = call("GET", "/matches/9999999")
check("不存在 → 404", st == 404, f"st={st}")

# 3.3 非法 id → 400
st, _ = call("GET", "/matches/abc")
check("非法 id → 400", st == 400, f"st={st}")


# ===== 汇总 =====
passed = sum(1 for _, ok in results if ok)
failed = sum(1 for _, ok in results if not ok)
print(f"\n== 結果: {passed}/{passed + failed} PASS ==")
sys.exit(0 if failed == 0 else 1)
