#!/usr/bin/env python3
"""verify_accounts.py — accounts.ts 端到端验证（2026-09-17，feature/verify-core-routes）

验证目标（PRD §3 accounts.ts）：
  1. 注册：成功 201 + token；重名 409；空 name 400
  2. GET /users：未登录 401；非 admin 403；admin 200 含 balance
  3. GET /users/:id：自己 OK；别人 403；admin 看任意 OK；不存在 404
  4. deposit：非 admin 403；负数 400；不存在用户 404；正数 200 余额+流水
用法:
  python3 scripts/verify_accounts.py [API_BASE] [DB_PATH]
"""
import json
import os
import sys
import urllib.request
import urllib.error

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:4100/api"
DB = (
    sys.argv[2]
    if len(sys.argv) > 2
    else os.environ.get("BETTING_DB_PATH", "data/betting.db")
)

# DB only used for read-back assertions (e.g. transaction row exists)
import sqlite3

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


# Login as admin (seeded on first DB boot: 'admin' / 'admin123')
admin_st, admin_res = call("POST", "/auth/login", body={"name": "admin", "password": "admin123"})
if admin_st != 200 or "token" not in admin_res:
    print(f"FAIL: cannot login admin (status={admin_st}, res={admin_res})")
    print("abort: ensure API was started with isolated DB so 'admin' seed exists")
    sys.exit(1)
admin_token = admin_res["token"]
admin_id = admin_res["user"]["id"]


# ===== 1. POST /users — 注册 =====
print("\n== 1. POST /users ==")

# 1.1 空 name → 400
st, res = call("POST", "/users", body={"name": ""})
check("空 name → 400", st == 400, f"st={st} res={res}")

# 1.2 缺 name → 400
st, res = call("POST", "/users", body={})
check("缺 name → 400", st == 400, f"st={st}")

# 1.3 正常注册 → 201 + token + user
uname = unique("v_acct")
st, res = call("POST", "/users", body={"name": uname, "password": "123456"})
check(
    "正常注册 → 201 + token + user",
    st == 201 and "token" in res and res["user"]["name"] == uname,
    f"st={st} keys={list(res.keys()) if isinstance(res, dict) else res}",
)
user_id = res["user"]["id"] if st == 201 else None
user_token = res["token"] if st == 201 else None

# 1.4 重名 → 409
st, res = call("POST", "/users", body={"name": uname, "password": "123456"})
check("重名 → 409", st == 409, f"st={st} res={res}")


# ===== 2. GET /users — 列表 =====
print("\n== 2. GET /users ==")

# 2.1 未登录 → 401
st, _ = call("GET", "/users")
check("未登录 → 401", st == 401, f"st={st}")

# 2.2 非 admin → 403
st, _ = call("GET", "/users", token=user_token)
check("非 admin → 403", st == 403, f"st={st}")

# 2.3 admin → 200 + 列表含 balance
st, res = call("GET", "/users", token=admin_token)
has_balance = (
    st == 200
    and "users" in res
    and isinstance(res["users"], list)
    and len(res["users"]) > 0
    and "balance" in res["users"][0]
)
check("admin → 200 + 列表含 balance", has_balance, f"st={st} n={len(res.get('users', [])) if isinstance(res, dict) else 0}")


# ===== 3. GET /users/:id =====
print("\n== 3. GET /users/:id ==")

# 3.1 看自己 → 200
st, res = call("GET", f"/users/{user_id}", token=user_token)
check("自己 → 200", st == 200 and res["user"]["id"] == user_id, f"st={st}")

# 3.2 别人 → 403
other_name = unique("v_other")
st2, res2 = call("POST", "/users", body={"name": other_name, "password": "123456"})
if st2 == 201:
    other_token = res2["token"]
    other_id = res2["user"]["id"]
    st, _ = call("GET", f"/users/{other_id}", token=user_token)
    check("看别人 → 403", st == 403, f"st={st}")
else:
    check("看别人 → 403", False, f"setup failed: {st2}")

# 3.3 admin 看任意 → 200
st, res = call("GET", f"/users/{user_id}", token=admin_token)
check("admin 看任意 → 200", st == 200 and res["user"]["id"] == user_id, f"st={st}")

# 3.4 不存在 → 404
st, _ = call("GET", "/users/9999999", token=admin_token)
check("不存在 → 404", st == 404, f"st={st}")

# 3.5 非法 id → 400
st, _ = call("GET", "/users/abc", token=admin_token)
check("非法 id → 400", st == 400, f"st={st}")


# ===== 4. POST /users/:id/deposit =====
print("\n== 4. POST /users/:id/deposit ==")

# 4.1 非 admin → 403
st, _ = call("POST", f"/users/{user_id}/deposit", token=user_token, body={"amount": 100})
check("非 admin → 403", st == 403, f"st={st}")

# 4.2 负数 → 400
st, _ = call("POST", f"/users/{user_id}/deposit", token=admin_token, body={"amount": -100})
check("负数 → 400", st == 400, f"st={st}")

# 4.3 零 → 400
st, _ = call("POST", f"/users/{user_id}/deposit", token=admin_token, body={"amount": 0})
check("零 → 400", st == 400, f"st={st}")

# 4.4 不存在用户 → 404
st, _ = call("POST", "/users/9999999/deposit", token=admin_token, body={"amount": 100})
check("不存在用户 → 404", st == 404, f"st={st}")

# 4.5 正常充值 → 200 + 余额+流水
st, res = call("POST", f"/users/{user_id}/deposit", token=admin_token, body={"amount": 1000})
ok = (
    st == 200
    and res["account"]["balance"] == 1000
    and res["transaction"]["type"] == "deposit"
    and res["transaction"]["amount"] == 1000
)
check("正常充值 → 200 + 余额=1000 + 流水", ok, f"st={st} res={res}")

# 4.6 再充一次 → 余额累加
st, res = call("POST", f"/users/{user_id}/deposit", token=admin_token, body={"amount": 500})
ok = st == 200 and res["account"]["balance"] == 1500
check("二次充值 → 余额=1500", ok, f"st={st} bal={res.get('account', {}).get('balance') if isinstance(res, dict) else 'n/a'}")

# 4.7 DB 流水行存在（read-back 校验）
if os.path.exists(DB):
    try:
        conn = sqlite3.connect(DB)
        conn.row_factory = sqlite3.Row
        row = conn.execute(
            "SELECT t.type, t.amount FROM transactions t "
            "JOIN accounts a ON a.id = t.account_id "
            "WHERE a.user_id = ? ORDER BY t.id",
            (user_id,),
        ).fetchall()
        conn.close()
        types = [r["type"] for r in row]
        amounts = [r["amount"] for r in row]
        ok = len(row) == 2 and types == ["deposit", "deposit"] and amounts == [1000, 500]
        check("DB 流水 2 行 [1000, 500]", ok, f"got {list(zip(types, amounts))}")
    except Exception as e:
        check("DB 流水 2 行 [1000, 500]", False, f"DB read err: {e}")
else:
    print(f"(skip DB read-back: {DB} not accessible from this runner)")


# ===== 汇总 =====
passed = sum(1 for _, ok in results if ok)
failed = sum(1 for _, ok in results if not ok)
print(f"\n== 結果: {passed}/{passed + failed} PASS ==")
sys.exit(0 if failed == 0 else 1)
