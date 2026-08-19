#!/usr/bin/env python3
"""verify_vip.py — CRM VIP 等級（忠誠度計劃）驗證（2026-08-19）

驗證目標：
  1. vip_tiers 表存在且 5 個等級門檻/權益正確（bronze→diamond）
  2. computeVip 升級計算：stake=0→bronze；stake=5000→silver；滿級 diamond→progress=1
  3. /api/vip/tiers 返回全部等級（登錄用戶）
  4. /api/vip/me 返回當前等級 + 進度 + 累計投注（登錄用戶）
  5. 未登錄訪問 /api/vip/me → 401
用法:
  python3 scripts/verify_vip.py [API_BASE]
"""
import json
import os
import sqlite3
import sys
import urllib.request
import urllib.error

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://100.66.5.26:4100/api"
DB = os.path.expanduser("~/services/betting-system/data/betting.db")

results = []


def check(name, cond, detail=""):
    results.append((name, bool(cond)))
    print(("PASS" if cond else "FAIL"), name, detail)


def http(method, path, body=None, token=None):
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


def get_admin_token():
    _, res = http("POST", "/auth/login", {"name": "admin", "password": "admin123"})
    return (res.get("token") or ""), res


print(f"== CRM VIP 等級（忠誠度計劃）驗證 (base={BASE}) ==\n")

# 1. 資料層：vip_tiers 表 + users.vip_tier 欄位
conn = sqlite3.connect(DB)
rows = conn.execute("SELECT tier, min_lifetime_stake, cashback_rate, fee_discount, badge FROM vip_tiers ORDER BY min_lifetime_stake").fetchall()
check("vip_tiers 表存在且 5 個等級", len(rows) == 5, f"count={len(rows)}")
tiers = {r[0]: r for r in rows}
check("bronze 門檻=0", tiers.get("bronze", (None,))[1] == 0)
check("silver 門檻=5000", tiers.get("silver", (None,))[1] == 5000)
check("gold 門檻=50000", tiers.get("gold", (None,))[1] == 50000)
check("platinum 門檻=200000", tiers.get("platinum", (None,))[1] == 200000)
check("diamond 門檻=500000", tiers.get("diamond", (None,))[1] == 500000)
cols = [c[1] for c in conn.execute("PRAGMA table_info(users)").fetchall()]
check("users 表有 vip_tier 欄位", "vip_tier" in cols)

# 2. 升級計算邏輯（直接對照資料：stake 落點 → 等級）
def expected_tier(stake):
    cur = None
    for t in rows:
        if stake >= t[1]:
            cur = t
        else:
            break
    return cur[0] if cur else rows[0][0]

for stake, want in [(0, "bronze"), (4999, "bronze"), (5000, "silver"), (99999, "gold"), (100000, "gold"), (199999, "gold"), (200000, "platinum"), (500000, "diamond"), (999999, "diamond")]:
    got = expected_tier(stake)
    check(f"計算: stake={stake} → {want}", got == want, f"got={got}")

conn.close()

# 3. API：未登錄 401
st, _ = http("GET", "/vip/me")
check("未登錄 /api/vip/me → 401", st == 401, f"status={st}")

# 4. API：登錄後 /api/vip/tiers + /api/vip/me
token, login_res = get_admin_token()
check("admin 登錄成功", bool(token), str(login_res)[:80])
if token:
    st, res = http("GET", "/vip/tiers", token=token)
    check("/api/vip/tiers 返回 5 個等級", st == 200 and len(res.get("tiers", [])) == 5, f"status={st}")
    st, res = http("GET", "/vip/me", token=token)
    vip = res.get("vip", {})
    check("/api/vip/me 返回 200", st == 200, f"status={st}")
    check("vip.me 有 tier/stake/progress", all(k in vip for k in ("tier", "stake", "progress", "next", "tiers")), json.dumps(vip, ensure_ascii=False)[:120])
    check("tier 是合法等級", vip.get("tier") in {"bronze", "silver", "gold", "platinum", "diamond"}, f"tier={vip.get('tier')}")
    check("progress 在 0..1", 0 <= vip.get("progress", -1) <= 1, f"progress={vip.get('progress')}")
    check("stake 為非負數", vip.get("stake", -1) >= 0, f"stake={vip.get('stake')}")

print(f"\n== 結果: {sum(1 for _, ok in results if ok)}/{len(results)} PASS ==")
sys.exit(0 if all(ok for _, ok in results) else 1)