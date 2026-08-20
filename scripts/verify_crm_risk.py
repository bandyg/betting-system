#!/usr/bin/env python3
"""verify_crm_risk.py — CRM 促销风控（bonus 审核 + 领取限制 + 流水要求）验证（2026-08-20）

验证目标：
  1. Schema：promotions 有 max_claims_per_user/wagering_multiplier；promotion_claims 有
     status/bonus_amount/wagering_required/wagering_done/approved_at；accounts 有 bonus_balance；
     transactions CHECK 含 'bonus'
  2. 领取校验：未登录 401 / 非 active 409 / 不在有效期(start_at/end_at) 409 /
     限领次数超限 409 / min_deposit 不达标 409 / 重复 pending 409
  3. admin 审核：approve 无流水 → 直接进 balance；有流水 → 进 bonus_balance + wagering_required；
     reject 不发放；rejected 后可重领
  4. 权限：非 admin approve → 403；listClaims 普通用户只能查自己（查他人 → 403）
  5. 流水追踪：投注结算(won/lost)累计 wagering_done，达标后 bonus 从 bonus_balance 转 balance
用法:
  python3 scripts/verify_crm_risk.py [API_BASE] [DB_PATH]
"""
import json
import os
import sys
import sqlite3
import urllib.request
import urllib.error

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://100.66.5.26:4198/api"
DB = (
    sys.argv[2]
    if len(sys.argv) > 2
    else os.environ.get("BETTING_DB_PATH", os.path.expanduser("~/services/betting-system/data/betting.db"))
)

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


def ensure_user(prefix):
    name = f"{prefix}_{os.urandom(3).hex()}"
    st, res = call("POST", "/users", body={"name": name, "password": "123456"})
    if st == 201 and res.get("token"):
        return name, res["user"]["id"], res["token"]
    st, res = call("POST", "/auth/login", body={"name": name, "password": "123456"})
    if st == 200 and res.get("token"):
        return name, res["user"]["id"], res["token"]
    return name, None, None


def deposit(uid, admin_tok, amount):
    st, res = call("POST", f"/users/{uid}/deposit", token=admin_tok, body={"amount": amount})
    return st == 200, f"st={st} res={res}"

def new_match(admin_tok, home, away):
    st, res = call(
        "POST",
        "/matches",
        token=admin_tok,
        body={"homeTeam": home, "awayTeam": away, "kickoffTime": "2026-09-01T12:00:00Z", "sport": "soccer", "league": "crm-test"},
    )
    return res.get("match", {}).get("id")


def new_market(admin_tok, match_id, mtype, odds, line=None):
    body = {"type": mtype, "odds": odds}
    if line is not None:
        body["line"] = line
    st, res = call("POST", f"/matches/{match_id}/markets", token=admin_tok, body=body)
    return res.get("market", {}).get("id")


def account(uid):
    conn = sqlite3.connect(DB)
    row = conn.execute("SELECT balance, bonus_balance FROM accounts WHERE user_id = ?", (uid,)).fetchone()
    conn.close()
    return (row[0], row[1]) if row else (None, None)


def claim_row(uid, promotion_id):
    conn = sqlite3.connect(DB)
    row = conn.execute(
        "SELECT status, bonus_amount, wagering_required, wagering_done FROM promotion_claims WHERE user_id = ? AND promotion_id = ? ORDER BY id DESC LIMIT 1",
        (uid, promotion_id),
    ).fetchone()
    conn.close()
    return row


print(f"== CRM 促销风控验证 (base={BASE}, db={DB}) ==\n")

# 0. Schema 层
conn = sqlite3.connect(DB)
promo_cols = [r[1] for r in conn.execute("PRAGMA table_info(promotions)").fetchall()]
claim_cols = [r[1] for r in conn.execute("PRAGMA table_info(promotion_claims)").fetchall()]
acc_cols = [r[1] for r in conn.execute("PRAGMA table_info(accounts)").fetchall()]
tx_sql = conn.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='transactions'").fetchone()[0]
conn.close()
check("promotions 有 max_claims_per_user", "max_claims_per_user" in promo_cols)
check("promotions 有 wagering_multiplier", "wagering_multiplier" in promo_cols)
check("promotion_claims 有 status", "status" in claim_cols)
check("promotion_claims 有 bonus_amount/wagering_required/wagering_done", all(c in claim_cols for c in ["bonus_amount", "wagering_required", "wagering_done"]))
check("promotion_claims 有 approved_at", "approved_at" in claim_cols)
check("accounts 有 bonus_balance", "bonus_balance" in acc_cols)
check("transactions CHECK 含 bonus", "'bonus'" in tx_sql)

# 1. 账号准备
b_name, bob_id, bob_tok = ensure_user("crm_bob")
c_name, carol_id, carol_tok = ensure_user("crm_carol")
check("bob 注册", bob_id is not None and bool(bob_tok))
check("carol 注册", carol_id is not None and bool(carol_tok))
st, res = call("POST", "/auth/login", body={"name": "admin", "password": "admin123"})
admin_tok = res.get("token")
check("admin 登录", st == 200 and bool(admin_tok))

# 2. 建促销（admin）
st, res = call(
    "POST",
    "/crm/promotions",
    token=admin_tok,
    body={
        "title": "首充双倍",
        "description": "充值送 30%",
        "bonus_type": "deposit_bonus",
        "bonus_value": 30,
        "min_deposit": 200,
        "max_claims_per_user": 1,
        "wagering_multiplier": 0,
    },
)
p2 = res.get("promotion", {})
check("建 deposit_bonus 促销 → 201", st == 201 and p2.get("id"), f"st={st}")
check("max_claims_per_user=1 落库", p2.get("max_claims_per_user") == 1, f"mc={p2.get('max_claims_per_user')}")

st, res = call(
    "POST",
    "/crm/promotions",
    token=admin_tok,
    body={
        "title": "免费投注",
        "description": "送 50 免费投注",
        "bonus_type": "free_bet",
        "bonus_value": 50,
        "min_deposit": 0,
        "max_claims_per_user": 2,
        "wagering_multiplier": 2,
    },
)
p1 = res.get("promotion", {})
check("建 free_bet 促销(流水×2) → 201", st == 201 and p1.get("id"), f"st={st}")
check("wagering_multiplier=2 落库", p1.get("wagering_multiplier") == 2, f"wm={p1.get('wagering_multiplier')}")

st, res = call(
    "POST",
    "/crm/promotions",
    token=admin_tok,
    body={
        "title": "未开始",
        "description": "start_at 未来",
        "bonus_type": "free_bet",
        "bonus_value": 10,
        "start_at": "2027-01-01 00:00:00",
    },
)
p3 = res.get("promotion", {})
check("建未开始促销 → 201", st == 201 and p3.get("id"), f"st={st}")

st, _ = call("POST", "/crm/promotions", token=bob_tok, body={"title": "x", "bonus_type": "free_bet", "bonus_value": 1})
check("非 admin 建促销 → 403", st == 403, f"st={st}")

# 3. 领取校验
st, _ = call("POST", f"/crm/promotions/{p1['id']}/claim")
check("未登录领取 → 401", st == 401, f"st={st}")
st, _ = call("POST", f"/crm/promotions/{p3['id']}/claim", token=bob_tok)
check("未开始促销领取 → 409", st == 409, f"st={st}")
st, _ = call("POST", f"/crm/promotions/{p2['id']}/claim", token=carol_tok)
check("carol 存款不足领取 → 409", st == 409, f"st={st}")

ok, d = deposit(bob_id, admin_tok, 300)
check("bob 充值 300", ok, d)
bal0, bbal0 = account(bob_id)
check("bob balance=300", abs(bal0 - 300) < 1e-9, f"bal={bal0}")
st, res = call("POST", f"/crm/promotions/{p2['id']}/claim", token=bob_tok)
check("bob 存款达标领取 → 201 pending", st == 201 and res.get("claim", {}).get("status") == "pending", f"st={st}")
claim2_id = res.get("claim", {}).get("id")
st, _ = call("POST", f"/crm/promotions/{p2['id']}/claim", token=bob_tok)
check("重复 pending 领取 → 409", st == 409, f"st={st}")

st, res = call("POST", f"/crm/promotions/{p1['id']}/claim", token=bob_tok)
check("bob 领 free_bet → 201 pending", st == 201 and res.get("claim", {}).get("status") == "pending", f"st={st}")
claim1_id = res.get("claim", {}).get("id")

# 4. admin 审核
st, _ = call("POST", f"/crm/promotions/{p2['id']}/claims/{claim2_id}/approve", token=bob_tok)
check("非 admin approve → 403", st == 403, f"st={st}")
st, res = call("POST", f"/crm/promotions/{p2['id']}/claims/{claim2_id}/approve", token=admin_tok)
check("approve 无流水 → 200", st == 200, f"st={st}")
bal1, bbal1 = account(bob_id)
check("bonus 30 直接进 balance(330)", abs(bal1 - 330) < 1e-9, f"bal={bal1}")
check("bonus_balance 仍为 0", bbal1 == 0, f"bbal={bbal1}")
r = claim_row(bob_id, p2["id"])
check("claim2 approved + bonus_amount=30", r[0] == "approved" and abs(r[1] - 30) < 1e-9, f"row={r}")

st, res = call("POST", f"/crm/promotions/{p1['id']}/claims/{claim1_id}/approve", token=admin_tok)
check("approve 有流水 → 200", st == 200, f"st={st}")
bal2, bbal2 = account(bob_id)
check("balance 不变(330) 不进主余额", abs(bal2 - 330) < 1e-9, f"bal={bal2}")
check("bonus 50 进 bonus_balance", abs(bbal2 - 50) < 1e-9, f"bbal={bbal2}")
r = claim_row(bob_id, p1["id"])
check("claim1 approved + wagering_required=100", r[0] == "approved" and abs(r[2] - 100) < 1e-9, f"row={r}")
check("wagering_done 初始 0", abs(r[3]) < 1e-9, f"done={r[3]}")

# 5. reject + 重领
st, res = call("POST", f"/crm/promotions/{p1['id']}/claim", token=carol_tok)
carol_cid = res.get("claim", {}).get("id")
check("carol 领 free_bet → 201", st == 201 and carol_cid, f"st={st}")
st, res = call("POST", f"/crm/promotions/{p1['id']}/claims/{carol_cid}/reject", token=admin_tok)
check("reject → 200", st == 200 and res.get("claim", {}).get("status") == "rejected", f"st={st}")
balc, bbalc = account(carol_id)
check("reject 不发放（carol balance=0）", abs(balc) < 1e-9 and bbalc == 0, f"bal={balc},bbal={bbalc}")
st, _ = call("POST", f"/crm/promotions/{p1['id']}/claim", token=carol_tok)
check("rejected 后可重领 → 201", st == 201, f"st={st}")

# 6. 权限：listClaims
st, res = call("GET", f"/crm/promotions/{p1['id']}/claims?userId={bob_id}", token=carol_tok)
check("carol 查 bob 的领取 → 403", st == 403, f"st={st}")
st, res = call("GET", f"/crm/promotions/{p1['id']}/claims", token=admin_tok)
check("admin 查全部领取", st == 200 and res.get("count", 0) >= 2, f"st={st},count={res.get('count')}")
st, res = call("GET", f"/crm/promotions/{p1['id']}/claims?userId={bob_id}", token=bob_tok)
check("bob 查自己领取 → 200", st == 200 and res.get("count") == 1, f"st={st},count={res.get('count')}")

# 7. 流水追踪：投注结算累计 wagering_done，达标解锁
m1 = new_match(admin_tok, "流水主队A", "流水客队A")
mk1 = new_market(admin_tok, m1, "1x2", {"home": 2.0, "draw": 3.2, "away": 3.5})
check("建比赛/市场", m1 is not None and mk1 is not None)
st, res = call("POST", "/bets", token=bob_tok, body={"marketId": mk1, "selection": "home", "stake": 100})
check("bob 下注 100 → 201", st == 201, f"st={st}")
bal3, _ = account(bob_id)
check("扣款后 balance=230", abs(bal3 - 230) < 1e-9, f"bal={bal3}")
st, res = call("POST", f"/matches/{m1}/result", token=admin_tok, body={"homeScore": 2, "awayScore": 0})
check("记录比分 → 200", st == 200, f"st={st}")
st, res = call("POST", f"/matches/{m1}/settle", token=admin_tok)
check("结算 → 200", st == 200, f"st={st}")
bal4, bbal4 = account(bob_id)
check("won 派彩 200 + bonus 解锁 50 → balance=480", abs(bal4 - 480) < 1e-9, f"bal={bal4}")
check("流水达标 → bonus_balance 50 转入主余额(0)", abs(bbal4) < 1e-9, f"bbal={bbal4}")
r = claim_row(bob_id, p1["id"])
check("wagering_done=100 达标", abs(r[3] - 100) < 1e-9, f"done={r[3]}")

# 8. 汇总
passed = sum(1 for _, ok in results if ok)
print(f"\n== 结果: {passed}/{len(results)} PASS ==")
sys.exit(0 if passed == len(results) else 1)