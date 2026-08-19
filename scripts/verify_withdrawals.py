#!/usr/bin/env python3
"""verify_withdrawals.py — PAM 提现闭环验证（2026-08-19）

验证目标：
  1. 权限：匿名 401 / 普通用户 / admin 访问控制
  2. 参数校验：金额范围（10~50000）、非法 method、余额不足
  3. 重复提现：同金额 pending 去重 409
  4. 审批闭环：approve（扣款+流水）→ paid；reject（余额不动）
  5. 幂等：重复 approve/reject 409；approved 后不能 reject
  6. 日累计限额：todayWithdrawn + amount > 100000 → 400
用法:
  python3 scripts/verify_withdrawals.py [API_BASE] [DB_PATH]
"""
import json
import os
import sqlite3
import sys
import urllib.request
import urllib.error

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://100.66.5.26:4100/api"
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


print(f"== PAM 提现闭环验证 (base={BASE}, db={DB}) ==\n")

# 0. 账号准备
alice_name, alice_id, alice_tok = ensure_user("wd_alice")
check("alice 注册/登录", alice_id is not None and bool(alice_tok))
st, res = call("POST", "/auth/login", body={"name": "admin", "password": "admin123"})
admin_tok = res.get("token")
check("admin 登录", st == 200 and bool(admin_tok))

# 1. 权限：匿名 401
st, _ = call("POST", "/withdrawals", body={"amount": 100})
check("匿名提现 → 401", st == 401, f"st={st}")
st, _ = call("GET", "/withdrawals?all=1", token=alice_tok)
check("普通用户 all=1 → 403", st == 403, f"st={st}")

# 2. 参数校验
st, res = call("POST", "/withdrawals", token=alice_tok, body={"amount": 5})
check("金额 < 10 → 400", st == 400, f"st={st}")
st, res = call("POST", "/withdrawals", token=alice_tok, body={"amount": 999999})
check("金额 > 50000 → 400", st == 400, f"st={st}")
st, res = call("POST", "/withdrawals", token=alice_tok, body={"amount": 100, "method": "alipay"})
check("非法 method → 400", st == 400, f"st={st}")
st, res = call("POST", "/withdrawals", token=alice_tok, body={"amount": 50000})
check("余额不足 → 400", st == 400, f"st={st}")

# 3. 充值后正常提现
st, res = call("POST", "/users/%d/deposit" % alice_id, token=admin_tok, body={"amount": 5000})
check("admin 充值 5000", st == 200, f"st={st}")
st, res = call("POST", "/withdrawals", token=alice_tok, body={"amount": 1000, "method": "bank", "account_info": "6222****1234"})
check("正常提现 1000 → 201", st == 201 and res.get("withdrawal", {}).get("status") == "pending", f"st={st}")
wd1 = res.get("withdrawal", {})
check("wd_no 格式 WD 开头", str(wd1.get("wd_no", "")).startswith("WD"), f"wd_no={wd1.get('wd_no')}")

# 4. 同金额 pending 去重
st, res = call("POST", "/withdrawals", token=alice_tok, body={"amount": 1000})
check("同金额 pending 重复 → 409", st == 409, f"st={st}")
# 不同金额可再提
st, res = call("POST", "/withdrawals", token=alice_tok, body={"amount": 2000})
check("不同金额可再提 → 201", st == 201, f"st={st}")
wd2 = res.get("withdrawal", {})

# 5. 我的列表（含状态筛选）
st, res = call("GET", "/withdrawals", token=alice_tok)
check("我的提现列表 200", st == 200 and len(res.get("withdrawals", [])) == 2, f"st={st} count={len(res.get('withdrawals', []))}")
st, res = call("GET", "/withdrawals?status=pending", token=alice_tok)
check("筛选 pending = 2", st == 200 and res.get("count") == 2, f"st={st} count={res.get('count')}")

# 6. 审批前余额快照
con = sqlite3.connect(DB)
bal_before = con.execute("SELECT balance FROM accounts WHERE user_id=?", (alice_id,)).fetchone()[0]

# 7. 普通用户不能审批
st, _ = call("POST", "/withdrawals/%d/approve" % wd1["id"], token=alice_tok)
check("普通用户 approve → 403", st == 403, f"st={st}")

# 8. approve 闭环（扣款 + 流水）
st, res = call("POST", "/withdrawals/%d/approve" % wd1["id"], token=admin_tok)
check("approve → 200", st == 200 and res.get("withdrawal", {}).get("status") == "approved", f"st={st}")
bal_after = con.execute("SELECT balance FROM accounts WHERE user_id=?", (alice_id,)).fetchone()[0]
check("approve 扣款 1000", abs(bal_before - bal_after - 1000) < 0.01, f"before={bal_before} after={bal_after}")
tx = con.execute("SELECT type, amount, ref_type, ref_id FROM transactions WHERE ref_type='withdrawal' AND ref_id=?", (wd1["id"],)).fetchone()
check("扣款流水写入 (payout 负数)", tx is not None and tx[0] == "payout" and tx[1] < 0 and tx[2] == "withdrawal", f"tx={tx}")

# 9. 幂等：重复 approve 409
st, res = call("POST", "/withdrawals/%d/approve" % wd1["id"], token=admin_tok)
check("重复 approve → 409", st == 409, f"st={st}")

# 10. approved → paid
st, res = call("POST", "/withdrawals/%d/paid" % wd1["id"], token=admin_tok)
check("paid → 200", st == 200 and res.get("withdrawal", {}).get("status") == "paid", f"st={st}")
st, _ = call("POST", "/withdrawals/%d/paid" % wd1["id"], token=admin_tok)
check("重复 paid → 409", st == 409, f"st={st}")
st, _ = call("POST", "/withdrawals/%d/reject" % wd1["id"], token=admin_tok)
check("paid 后 reject → 409", st == 409, f"st={st}")

# 11. reject 闭环（余额不动）
bal_before2 = con.execute("SELECT balance FROM accounts WHERE user_id=?", (alice_id,)).fetchone()[0]
st, res = call("POST", "/withdrawals/%d/reject" % wd2["id"], token=admin_tok, body={"reason": "账户信息不符"})
check("reject → 200", st == 200 and res.get("withdrawal", {}).get("status") == "rejected", f"st={st}")
check("reject 写原因", res.get("withdrawal", {}).get("reject_reason") == "账户信息不符", f"reason={res.get('withdrawal', {}).get('reject_reason')}")
bal_after2 = con.execute("SELECT balance FROM accounts WHERE user_id=?", (alice_id,)).fetchone()[0]
check("reject 余额不动", abs(bal_before2 - bal_after2) < 0.01, f"before={bal_before2} after={bal_after2}")

# 12. 日累计限额：先用 pending 记录占额度（pending 计入 today），再提超限金额
# 余额可能不足以占额度 → 先充值 100000 确保余额充足
st, res = call("POST", "/users/%d/deposit" % alice_id, token=admin_tok, body={"amount": 100000})
check("admin 充值 100000（限额测试）", st == 200, f"st={st}")
today = con.execute(
    "SELECT COALESCE(SUM(amount),0) FROM withdrawals WHERE user_id=? AND status != 'rejected' AND date(created_at)=date('now')",
    (alice_id,),
).fetchone()[0]
# 当前 today 含已通过/已打款；构造 remaining < 50000：提 remaining-1 并保持 pending
remaining = 100000 - today
need = remaining - 50000
if need > 0:
    st, res = call("POST", "/withdrawals", token=alice_tok, body={"amount": need + 1})
    check("占额度提现 → 201", st == 201, f"st={st} amount={need + 1}")
else:
    check("占额度提现 → 201", True, f"skip (remaining={remaining} < 50000)")
today2 = con.execute(
    "SELECT COALESCE(SUM(amount),0) FROM withdrawals WHERE user_id=? AND status != 'rejected' AND date(created_at)=date('now')",
    (alice_id,),
).fetchone()[0]
remaining2 = 100000 - today2
st, res = call("POST", "/withdrawals", token=alice_tok, body={"amount": remaining2 + 1})
check("超日累计 → 400", st == 400, f"st={st} today={today2} amount={remaining2 + 1}")

con.close()

print(f"\n== 結果: {sum(1 for _, ok in results if ok)}/{len(results)} PASS ==")
sys.exit(0 if all(ok for _, ok in results) else 1)