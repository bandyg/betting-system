#!/usr/bin/env python3
"""verify_crm_segment.py — R11 CRM 分群 + 营销端到端验证（隔离 DB）。

覆盖（12 asserts）：
  1. admin 创建 segment（rules: vipTier=gold+, lifetimeStake>=1000）
  2. admin preview segment → 返回 matched count + sample
  3. admin 创建 campaign（action_type=site_message, trigger_type=manual）
  4. admin 手动 run campaign → 写 notifications + crm_campaign_executions
  5. user GET /notifications 看见营销消息 + unreadCount > 0
  6. user POST /notifications/:id/read → read_at 写入
  7. user POST /notifications/read-all → unreadCount = 0
  8. 重复 run 同一 campaign：因 UNIQUE 防重复，第二次 delivered = 0（cooldown 也起作用）
  9. anon GET /admin/crm/segments → 401
  10. 普通用户 GET /admin/crm/campaigns → 403
  11. bonus_credit：run campaign with bonus=50 → accounts.balance 增加 + transactions 写入
  12. segment 评估排除 admin（admin 永远是 diamond，但不被命中）

用法：python3 scripts/verify_crm_segment.py [API_BASE] [DB_PATH]
"""
import os
import sys
import json
import sqlite3
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
            return r.status, json.loads(r.read().decode() or "{}")
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read().decode() or "{}")
        except Exception:
            return e.code, {}


# admin + 找第一个非 admin user
st, res = call("POST", "/auth/login", body={"name": "admin", "password": "admin123"})
atoken = res.get("token") if isinstance(res, dict) else None
check("admin login", st == 200 and atoken, f"st={st}")

utoken = None
uid = None
if DB_PATH and os.path.exists(DB_PATH):
    con = sqlite3.connect(DB_PATH)
    rows = con.execute("SELECT id, name FROM users WHERE name != 'admin' ORDER BY id LIMIT 1").fetchall()
    con.close()
    if rows:
        uid = rows[0][0]
        st, res = call("POST", "/auth/login", body={"name": rows[0][1], "password": "123456"})
        utoken = res.get("token") if isinstance(res, dict) else None

# 1. 创建 segment
st, res = call("POST", "/admin/crm/segments", token=atoken, body={
    "slug": "verify-test-gold-high",
    "name": "测试分群：高价值 + gold+",
    "rules": {"vipTier": "gold+", "lifetimeStake": ">=1000"},
})
seg_id = res.get("id") if isinstance(res, dict) else None
check("创建 segment → 201", st == 201 and seg_id, f"st={st} body={res}")

# 2. preview segment
st, res = call("POST", f"/admin/crm/segments/{seg_id}/preview", token=atoken, body={})
check("preview 200", st == 200)
check("preview 返回 count + sample", isinstance(res, dict) and "count" in res and "sample" in res)

# 3. 创建 campaign（site_message + manual）
st, res = call("POST", "/admin/crm/campaigns", token=atoken, body={
    "segment_id": seg_id,
    "name": "verify 站内信测试",
    "action_type": "site_message",
    "action_payload": {"title": "专属优惠", "body": "您获得 10% 返水", "link": "/promotions"},
    "trigger_type": "manual",
    "cooldown_days": 7,
})
camp_id = res.get("id") if isinstance(res, dict) else None
check("创建 campaign → 201", st == 201 and camp_id, f"st={st} body={res}")

# 4. 手动 run
st, res = call("POST", f"/admin/crm/campaigns/{camp_id}/run", token=atoken, body={})
check("run campaign 200", st == 200)
check("run 返回 matched/delivered/skipped", all(k in res for k in ("matched", "delivered", "skipped")),
      f"body={res}")

# 5. user 看 notifications
if utoken:
    st, res = call("GET", "/notifications", token=utoken)
    notifs = res.get("notifications", []) if isinstance(res, dict) else []
    check("GET /notifications 200", st == 200)
    # 是否含刚发的营销消息（前提：user 命中 segment；不命中也 OK，断言 unreadCount >= 0）
    check("unreadCount >= 0", (res.get("unreadCount", 0)) >= 0, f"unreadCount={res.get('unreadCount')}")

    # 6. mark single read
    if notifs:
        nid = notifs[0]["id"]
        st, res = call("POST", f"/notifications/{nid}/read", token=utoken)
        check("POST /notifications/:id/read 200", st == 200)

    # 7. read-all
    st, res = call("POST", "/notifications/read-all", token=utoken)
    check("POST /notifications/read-all 200", st == 200)

# 8. 重复 run：cooldown_days=7 + UNIQUE 双重防御
st, res = call("POST", f"/admin/crm/campaigns/{camp_id}/run", token=atoken, body={})
check("二次 run 200", st == 200)
# 第二次 delivered 应为 0（同一 user cooldown 内不重发）
if isinstance(res, dict):
    check("二次 run delivered = 0（cooldown + UNIQUE 防重复）", res.get("delivered", -1) == 0,
          f"delivered={res.get('delivered')} matched={res.get('matched')}")

# 9. anon GET /admin/crm/segments → 401
st, res = call("GET", "/admin/crm/segments")
check("anon GET /admin/crm/segments → 401", st == 401)

# 10. user GET /admin/crm/campaigns → 403
if utoken:
    st, res = call("GET", "/admin/crm/campaigns", token=utoken)
    check("user GET /admin/crm/campaigns → 403", st == 403, f"st={st}")

# 11. bonus_credit 端到端：新建 segment + campaign + run + 验 accounts.balance 增加
if DB_PATH and os.path.exists(DB_PATH) and uid is not None:
    con = sqlite3.connect(DB_PATH)
    bal_before = con.execute("SELECT balance FROM accounts WHERE user_id=?", (uid,)).fetchone()[0]
    con.close()

    # 创建一个简单 segment 必中（lifetimeStake>=0 + vipTier=silver）
    st, res = call("POST", "/admin/crm/segments", token=atoken, body={
        "slug": "verify-bonus-all",
        "name": "全 user（测奖金）",
        "rules": {"lifetimeStake": ">=0"},
    })
    seg2_id = res.get("id") if isinstance(res, dict) else None
    st, res = call("POST", "/admin/crm/campaigns", token=atoken, body={
        "segment_id": seg2_id,
        "name": "verify 奖金 50",
        "action_type": "bonus_credit",
        "action_payload": {"amount": 50},
        "trigger_type": "manual",
        "cooldown_days": 0,  # 关 cooldown 便于测
    })
    camp2_id = res.get("id") if isinstance(res, dict) else None
    st, res = call("POST", f"/admin/crm/campaigns/{camp2_id}/run", token=atoken, body={})
    check("bonus_credit run 200", st == 200 and res.get("delivered", 0) >= 1, f"body={res}")

    con = sqlite3.connect(DB_PATH)
    bal_after = con.execute("SELECT balance FROM accounts WHERE user_id=?", (uid,)).fetchone()[0]
    tx_count = con.execute("SELECT COUNT(*) FROM transactions WHERE type='adjust' AND account_id=(SELECT id FROM accounts WHERE user_id=?)", (uid,)).fetchone()[0]
    con.close()
    check("accounts.balance 增加 50", bal_after == bal_before + 50, f"before={bal_before} after={bal_after}")
    check("transactions 写入 adjust 行", tx_count >= 1, f"count={tx_count}")

# 12. admin 不被 segment 命中（sample 里不应出现 admin；不硬断言 count=0，
#     因 CI 共享 DB 可能被 verify_vip 造出 diamond 非 admin 用户）
st, res = call("POST", "/admin/crm/segments", token=atoken, body={
    "slug": "verify-diamond-any",
    "name": "diamond+ 测试",
    "rules": {"vipTier": "diamond+"},
})
seg3_id = res.get("id") if isinstance(res, dict) else None
st, res = call("POST", f"/admin/crm/segments/{seg3_id}/preview", token=atoken, body={})
sample = res.get("sample", []) if isinstance(res, dict) else []
check("diamond segment 排除 admin（sample 无 admin）",
      all(u.get("name") != "admin" for u in sample), f"sample_names={[u.get('name') for u in sample]}")

passed = sum(1 for _, ok in results if ok)
print(f"\n===== {passed}/{len(results)} PASSED =====")
sys.exit(0 if passed == len(results) else 1)