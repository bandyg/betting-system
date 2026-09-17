#!/usr/bin/env python3
"""verify_markets.py — markets.ts 端到端验证（2026-09-17，feature/verify-core-routes）

验证目标（PRD §3 markets.ts）：
  1. POST /matches/:id/markets：1x2/ah/ou 三种类型 happy path；line 校验（1x2 拒 line、ah/ou 拒 0/缺）；
     odds 校验（非法 selection 400、price ≤ 1 400）；重复 (type,line) 409
  2. GET /markets/:id：返回完整 odds
  3. PUT /markets/:id/odds：更新部分 selection；settled 拒 409；非法 selection 400
  4. suspend/resume：open→suspended→open 闭环；非 open 拒 409
用法:
  python3 scripts/verify_markets.py [API_BASE] [DB_PATH]
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


# Setup: admin login + create match
admin_st, admin_res = call("POST", "/auth/login", body={"name": "admin", "password": "admin123"})
if admin_st != 200 or "token" not in admin_res:
    print(f"FAIL: cannot login admin (status={admin_st})")
    sys.exit(1)
admin_token = admin_res["token"]

# Normal user for permission tests
uname = unique("v_mkt_user")
st, res = call("POST", "/users", body={"name": uname, "password": "123456"})
user_token = res["token"] if st == 201 else None

# Create a fresh match
st, res = call(
    "POST",
    "/matches",
    token=admin_token,
    body={"homeTeam": "Test Home", "awayTeam": "Test Away", "kickoffTime": "2027-03-01T00:00:00Z"},
)
match_id = res["match"]["id"] if st == 201 else None
if not match_id:
    print(f"FAIL: cannot create test match (status={st}, res={res})")
    sys.exit(1)


# ===== 1. POST /matches/:id/markets =====
print("\n== 1. POST /matches/:id/markets ==")

# 1.1 未登录 → 401
st, _ = call("POST", f"/matches/{match_id}/markets", body={"type": "1x2", "odds": {"home": 2.1, "draw": 3.2, "away": 3.0}})
check("未登录 → 401", st == 401, f"st={st}")

# 1.2 非 admin → 403
st, _ = call(
    "POST",
    f"/matches/{match_id}/markets",
    token=user_token,
    body={"type": "1x2", "odds": {"home": 2.1, "draw": 3.2, "away": 3.0}},
)
check("非 admin → 403", st == 403, f"st={st}")

# 1.3 非法 type → 400
st, _ = call(
    "POST",
    f"/matches/{match_id}/markets",
    token=admin_token,
    body={"type": "banana", "odds": {"home": 2.1}},
)
check("非法 type → 400", st == 400, f"st={st}")

# 1.4 1x2 不应带 line → 400
st, _ = call(
    "POST",
    f"/matches/{match_id}/markets",
    token=admin_token,
    body={"type": "1x2", "line": 0.5, "odds": {"home": 2.1, "draw": 3.2, "away": 3.0}},
)
check("1x2 带 line → 400", st == 400, f"st={st}")

# 1.5 ah 缺 line → 400
st, _ = call(
    "POST",
    f"/matches/{match_id}/markets",
    token=admin_token,
    body={"type": "ah", "odds": {"home": 1.9, "away": 2.0}},
)
check("ah 缺 line → 400", st == 400, f"st={st}")

# 1.6 ah line=0 → 400
st, _ = call(
    "POST",
    f"/matches/{match_id}/markets",
    token=admin_token,
    body={"type": "ah", "line": 0, "odds": {"home": 1.9, "away": 2.0}},
)
check("ah line=0 → 400", st == 400, f"st={st}")

# 1.7 odds 非法 selection → 400
st, _ = call(
    "POST",
    f"/matches/{match_id}/markets",
    token=admin_token,
    body={"type": "1x2", "odds": {"home": 2.1, "banana": 3.2, "away": 3.0}},
)
check("odds 非法 selection → 400", st == 400, f"st={st}")

# 1.8 odds price ≤ 1 → 400
st, _ = call(
    "POST",
    f"/matches/{match_id}/markets",
    token=admin_token,
    body={"type": "1x2", "odds": {"home": 1.0, "draw": 3.2, "away": 3.0}},
)
check("odds price ≤ 1 → 400", st == 400, f"st={st}")

# 1.9 1x2 正常 → 201 + 3 个 odds
st, res = call(
    "POST",
    f"/matches/{match_id}/markets",
    token=admin_token,
    body={"type": "1x2", "odds": {"home": 2.10, "draw": 3.40, "away": 3.20}},
)
m1x2 = res.get("market") if isinstance(res, dict) else None
ok = st == 201 and m1x2 and m1x2["type"] == "1x2" and m1x2["line"] is None and len(m1x2["odds"]) == 3
check("1x2 happy path → 201 + 3 odds", ok, f"st={st} type={m1x2.get('type') if m1x2 else 'n/a'}")
m1x2_id = m1x2["id"] if ok else None

# 1.10 ah 正常 → 201
st, res = call(
    "POST",
    f"/matches/{match_id}/markets",
    token=admin_token,
    body={"type": "ah", "line": -0.5, "odds": {"home": 1.85, "away": 2.05}},
)
mah = res.get("market") if isinstance(res, dict) else None
ok = st == 201 and mah and mah["type"] == "ah" and mah["line"] == -0.5 and len(mah["odds"]) == 2
check("ah -0.5 happy path → 201 + 2 odds", ok, f"st={st} line={mah.get('line') if mah else 'n/a'}")
mah_id = mah["id"] if ok else None

# 1.11 ou 正常 → 201
st, res = call(
    "POST",
    f"/matches/{match_id}/markets",
    token=admin_token,
    body={"type": "ou", "line": 2.5, "odds": {"over": 1.95, "under": 1.95}},
)
mou = res.get("market") if isinstance(res, dict) else None
ok = st == 201 and mou and mou["type"] == "ou" and mou["line"] == 2.5 and len(mou["odds"]) == 2
check("ou 2.5 happy path → 201 + 2 odds", ok, f"st={st} line={mou.get('line') if mou else 'n/a'}")
mou_id = mou["id"] if ok else None

# 1.12 重复 1x2 (null line) → 409
st, _ = call(
    "POST",
    f"/matches/{match_id}/markets",
    token=admin_token,
    body={"type": "1x2", "odds": {"home": 2.5, "draw": 3.0, "away": 3.0}},
)
check("重复 1x2 → 409", st == 409, f"st={st}")

# 1.13 重复 ah -0.5 → 409
st, _ = call(
    "POST",
    f"/matches/{match_id}/markets",
    token=admin_token,
    body={"type": "ah", "line": -0.5, "odds": {"home": 1.9, "away": 2.0}},
)
check("重复 ah -0.5 → 409", st == 409, f"st={st}")


# ===== 2. GET /markets/:id =====
print("\n== 2. GET /markets/:id ==")

st, res = call("GET", f"/markets/{m1x2_id}")
m = res.get("market") if isinstance(res, dict) else None
ok = st == 200 and m and m["id"] == m1x2_id and len(m["odds"]) == 3
check("GET /markets/:id 存在 → 200 + 3 odds", ok, f"st={st} n={len(m['odds']) if m else 0}")

st, _ = call("GET", "/markets/9999999")
check("GET /markets/:id 不存在 → 404", st == 404, f"st={st}")

st, _ = call("GET", "/markets/abc")
check("GET /markets/:id 非法 id → 400", st == 400, f"st={st}")


# ===== 3. PUT /markets/:id/odds — 调赔 =====
print("\n== 3. PUT /markets/:id/odds ==")

# 3.1 改部分 odds（只改 home）→ 200 + 只 home 价格变
st, res = call("PUT", f"/markets/{m1x2_id}/odds", token=admin_token, body={"odds": {"home": 2.50}})
m = res.get("market") if isinstance(res, dict) else None
home_price = next((o["price"] for o in (m["odds"] if m else []) if o["selection"] == "home"), None)
ok = st == 200 and home_price == 2.50
check("改 home 到 2.50 → 200", ok, f"st={st} home={home_price}")

# 3.2 改不存在的 selection → 400
st, _ = call("PUT", f"/markets/{m1x2_id}/odds", token=admin_token, body={"odds": {"banana": 5.0}})
check("改不存在 selection → 400", st == 400, f"st={st}")

# 3.3 price ≤ 1 → 400
st, _ = call("PUT", f"/markets/{m1x2_id}/odds", token=admin_token, body={"odds": {"home": 1.0}})
check("price ≤ 1 → 400", st == 400, f"st={st}")

# 3.4 非 admin → 403
st, _ = call("PUT", f"/markets/{m1x2_id}/odds", token=user_token, body={"odds": {"home": 2.0}})
check("非 admin → 403", st == 403, f"st={st}")


# ===== 4. POST /markets/:id/suspend + resume =====
print("\n== 4. suspend / resume ==")

# 4.1 suspend → 200 + status=suspended
st, res = call("POST", f"/markets/{m1x2_id}/suspend", token=admin_token)
ok = st == 200 and res.get("market", {}).get("status") == "suspended"
check("suspend → suspended", ok, f"st={st} status={res.get('market', {}).get('status') if isinstance(res, dict) else 'n/a'}")

# 4.2 再次 suspend → 409（不是 open）
st, _ = call("POST", f"/markets/{m1x2_id}/suspend", token=admin_token)
check("重复 suspend → 409", st == 409, f"st={st}")

# 4.3 非 admin suspend → 403
st, _ = call("POST", f"/markets/{mah_id}/suspend", token=user_token)
check("非 admin suspend → 403", st == 403, f"st={st}")

# 4.4 resume → 200 + status=open
st, res = call("POST", f"/markets/{m1x2_id}/resume", token=admin_token)
ok = st == 200 and res.get("market", {}).get("status") == "open"
check("resume → open", ok, f"st={st}")

# 4.5 重复 resume → 409（不是 suspended）
st, _ = call("POST", f"/markets/{m1x2_id}/resume", token=admin_token)
check("重复 resume → 409", st == 409, f"st={st}")

# 4.6 不存在 market suspend → 404
st, _ = call("POST", "/markets/9999999/suspend", token=admin_token)
check("不存在 market suspend → 404", st == 404, f"st={st}")


# ===== 汇总 =====
passed = sum(1 for _, ok in results if ok)
failed = sum(1 for _, ok in results if not ok)
print(f"\n== 結果: {passed}/{passed + failed} PASS ==")
sys.exit(0 if failed == 0 else 1)
