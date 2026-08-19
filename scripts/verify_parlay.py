#!/usr/bin/env python3
"""verify_parlay.py — SPORTBOOK 串关（parlay/accumulator）验证（2026-08-20）

验证目标：
  1. 校验：<2 legs 400 / 空选择 400 / 重复市场 400 / 同场两腿 400 / 负金额 400 / 匿名 401
  2. 下注：连乘赔率、potential_payout、legs 落库、market_id=NULL、bet_type=parlay、扣款一次
  3. 结算：
     a. 第一场腿赢 → 串关仍 open（等第二场）
     b. 第二场腿赢 → 整单 won，派彩 = stake × 连乘赔率
     c. 任一腿输 → 整单 lost（不派彩）
     d. 任一腿走盘(ah 平线) → 整单 void 全额退款
  4. 单注对照：独立结算不受串关影响
  5. 幂等：已结算场次再 settle → 409
用法:
  python3 scripts/verify_parlay.py [API_BASE] [DB_PATH]
"""
import json
import os
import sys
import sqlite3
import urllib.request
import urllib.error

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://100.66.5.26:4199/api"
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


def new_match(admin_tok, home, away):
    st, res = call(
        "POST",
        "/matches",
        token=admin_tok,
        body={"homeTeam": home, "awayTeam": away, "kickoffTime": "2026-09-01T12:00:00Z", "sport": "soccer", "league": "parlay-test"},
    )
    return res.get("match", {}).get("id")


def new_market(admin_tok, match_id, mtype, odds, line=None):
    body = {"type": mtype, "odds": odds}
    if line is not None:
        body["line"] = line
    st, res = call("POST", f"/matches/{match_id}/markets", token=admin_tok, body=body)
    return res.get("market", {}).get("id")


def balance(uid):
    conn = sqlite3.connect(DB)
    b = conn.execute("SELECT balance FROM accounts WHERE user_id = ?", (uid,)).fetchone()[0]
    conn.close()
    return b


print(f"== SPORTBOOK 串关验证 (base={BASE}, db={DB}) ==\n")

# 0. 账号准备
u_name, u_id, u_tok = ensure_user("pl_bob")
check("用户注册/登录", u_id is not None and bool(u_tok))
st, res = call("POST", "/auth/login", body={"name": "admin", "password": "admin123"})
admin_tok = res.get("token")
check("admin 登录", st == 200 and bool(admin_tok))

# 1. 建比赛 + 市场（全部先建，避免 settle 后市场关闭影响后续下注）
m1 = new_match(admin_tok, "串关主队A", "串关客队A")
m2 = new_match(admin_tok, "串关主队B", "串关客队B")
m3 = new_match(admin_tok, "串关主队C", "串关客队C")
m4 = new_match(admin_tok, "串关主队D", "串关客队D")
m5 = new_match(admin_tok, "串关主队E", "串关客队E")
check("建 5 场比赛", all(x is not None for x in [m1, m2, m3, m4, m5]))
mk1 = new_market(admin_tok, m1, "1x2", {"home": 2.0, "draw": 3.2, "away": 3.5})
mk2 = new_market(admin_tok, m2, "1x2", {"home": 1.8, "draw": 3.0, "away": 4.0})
mk3 = new_market(admin_tok, m3, "1x2", {"home": 1.5, "draw": 3.8, "away": 5.5})
mk4 = new_market(admin_tok, m4, "ah", {"home": 1.9, "away": 1.9}, line=-1.0)
mk5 = new_market(admin_tok, m5, "1x2", {"home": 1.6, "draw": 3.4, "away": 4.5})
check("建 5 个市场", all(x is not None for x in [mk1, mk2, mk3, mk4, mk5]))

# 2. 校验：非法入参
st, _ = call("POST", "/bets/parlay", token=u_tok, body={"legs": [{"marketId": mk1, "selection": "home"}], "stake": 100})
check("<2 legs → 400", st == 400, f"st={st}")
st, _ = call("POST", "/bets/parlay", token=u_tok, body={"legs": [{"marketId": mk1, "selection": ""}, {"marketId": mk2, "selection": "home"}], "stake": 100})
check("空选择 → 400", st == 400, f"st={st}")
st, _ = call("POST", "/bets/parlay", token=u_tok, body={"legs": [{"marketId": mk1, "selection": "home"}, {"marketId": mk1, "selection": "draw"}], "stake": 100})
check("重复市场 → 400", st == 400, f"st={st}")
st, _ = call("POST", "/bets/parlay", token=u_tok, body={"legs": [{"marketId": mk1, "selection": "home"}, {"marketId": mk1, "selection": "home"}], "stake": 100})
check("同场两腿 → 400", st == 400, f"st={st}")
st, _ = call("POST", "/bets/parlay", token=u_tok, body={"legs": [{"marketId": mk1, "selection": "home"}, {"marketId": mk2, "selection": "home"}], "stake": -5})
check("负金额 → 400", st == 400, f"st={st}")
st, _ = call("POST", "/bets/parlay", body={"legs": [{"marketId": mk1, "selection": "home"}, {"marketId": mk2, "selection": "home"}], "stake": 100})
check("匿名串关 → 401", st == 401, f"st={st}")

# 3. 充值 1000
conn = sqlite3.connect(DB)
conn.execute("UPDATE accounts SET balance = balance + 1000 WHERE user_id = ?", (u_id,))
conn.commit()
conn.close()
check("充值 1000", abs(balance(u_id) - 1000) < 1e-9, f"bal={balance(u_id)}")

# 4. 全部串关/单注先下注（余额：1000-100-50-60-50 = 740）
st, res = call(
    "POST",
    "/bets/parlay",
    token=u_tok,
    body={"legs": [{"marketId": mk1, "selection": "home"}, {"marketId": mk2, "selection": "home"}], "stake": 100},
)
bet = res.get("bet", {})
check("串关下注 → 201", st == 201 and bet.get("bet_type") == "parlay", f"st={st}")
check("连乘赔率 price=3.6", abs((bet.get("price") or 0) - 3.6) < 1e-9, f"price={bet.get('price')}")
check("potential_payout=360", abs((bet.get("potential_payout") or 0) - 360) < 1e-9, f"pp={bet.get('potential_payout')}")
check("legs 有 2 条", len(bet.get("legs") or []) == 2, f"legs={len(bet.get('legs') or [])}")
check("market_id 为空(NULL)", bet.get("market_id") is None, f"mid={bet.get('market_id')}")
pl_win_id = bet.get("id")

st, res = call("POST", "/bets", token=u_tok, body={"marketId": mk1, "selection": "home", "stake": 50})
single_id = res.get("bet", {}).get("id")
check("对照单注 → 201 single", st == 201 and res.get("bet", {}).get("bet_type") == "single", f"st={st}")

st, res = call(
    "POST",
    "/bets/parlay",
    token=u_tok,
    body={"legs": [{"marketId": mk3, "selection": "away"}, {"marketId": mk5, "selection": "home"}], "stake": 60},
)
lose_id = res.get("bet", {}).get("id")
check("输局串关下注 → 201", st == 201 and lose_id is not None, f"st={st}")

st, res = call(
    "POST",
    "/bets/parlay",
    token=u_tok,
    body={"legs": [{"marketId": mk4, "selection": "home"}, {"marketId": mk2, "selection": "home"}], "stake": 50},
)
void_id = res.get("bet", {}).get("id")
check("走盘串关下注 → 201", st == 201 and void_id is not None, f"st={st}")

check("四注扣款后余额 740", abs(balance(u_id) - 740) < 1e-9, f"bal={balance(u_id)}")

# 5. 结算 m1（主胜 2-0）：串关腿1 won，整单仍 open；单注独立派彩 100
st, res = call("POST", f"/matches/{m1}/result", token=admin_tok, body={"homeScore": 2, "awayScore": 0})
check("记录 m1 比分 → 200", st == 200, f"st={st}")
st, res = call("POST", f"/matches/{m1}/settle", token=admin_tok)
check("结算 m1 → 200", st == 200, f"st={st}")
st, res = call("GET", f"/bets/{pl_win_id}", token=admin_tok)
pl_status = res.get("bet", {}).get("status")
leg_statuses = [l["status"] for l in res.get("bet", {}).get("legs", [])]
check("m1 结算后串关仍 open", pl_status == "open", f"status={pl_status}")
check("leg1 won / leg2 仍 open", leg_statuses[0] == "won" and leg_statuses[1] == "open", f"legs={leg_statuses}")
st, res = call("GET", f"/bets/{single_id}", token=admin_tok)
check("单注独立结算 won", res.get("bet", {}).get("status") == "won", f"status={res.get('bet',{}).get('status')}")
check("余额 = 740+100(单注) = 840", abs(balance(u_id) - 840) < 1e-9, f"bal={balance(u_id)}")

# 6. 结算 m2（主胜 1-0）：串关腿2 won → 整单派彩 360；走盘串关腿2 won（腿1 未结算仍 open）
st, res = call("POST", f"/matches/{m2}/result", token=admin_tok, body={"homeScore": 1, "awayScore": 0})
check("记录 m2 比分 → 200", st == 200, f"st={st}")
st, res = call("POST", f"/matches/{m2}/settle", token=admin_tok)
won_summary = next((s for s in res.get("parlaySummary", []) if s.get("betId") == pl_win_id), None)
check("串关整单判定 won", won_summary is not None and won_summary.get("outcome") == "won", f"sum={won_summary}")
check("派彩 360", won_summary is not None and abs((won_summary.get("payoutAmount") or 0) - 360) < 1e-9, f"pay={won_summary}")
st, res = call("GET", f"/bets/{pl_win_id}", token=admin_tok)
check("整单 status=won", res.get("bet", {}).get("status") == "won", f"status={res.get('bet',{}).get('status')}")
check("余额 = 840(派彩含本金返还)+360 = 1200", abs(balance(u_id) - 1200) < 1e-9, f"bal={balance(u_id)}")
st, res = call("GET", f"/bets/{void_id}", token=admin_tok)
check("走盘串关 leg2 won / 整单仍 open", res.get("bet", {}).get("status") == "open", f"status={res.get('bet',{}).get('status')}")

# 7. 结算 m4（1-0，ah home -1.0 → 平线 void）：走盘串关整单 void 退款 50
st, res = call("POST", f"/matches/{m4}/result", token=admin_tok, body={"homeScore": 1, "awayScore": 0})
check("记录 m4 比分 → 200", st == 200, f"st={st}")
st, res = call("POST", f"/matches/{m4}/settle", token=admin_tok)
void_sum = next((s for s in res.get("parlaySummary", []) if s.get("betId") == void_id), None)
check("走盘腿 → 整单 void 退款", void_sum is not None and void_sum.get("outcome") == "void", f"sum={void_sum}")
check("走盘退款 50", void_sum is not None and abs((void_sum.get("refundAmount") or 0) - 50) < 1e-9, f"ref={void_sum}")
check("余额 = 1200+50(退款) = 1250", abs(balance(u_id) - 1250) < 1e-9, f"bal={balance(u_id)}")

# 8. 结算 m3（主胜 2-0）+ m5（主胜 2-0）：输局串关腿1 lost → 整单 lost（m5 结算后判定）
st, res = call("POST", f"/matches/{m3}/result", token=admin_tok, body={"homeScore": 2, "awayScore": 0})
st, res = call("POST", f"/matches/{m3}/settle", token=admin_tok)
st, res = call("POST", f"/matches/{m5}/result", token=admin_tok, body={"homeScore": 2, "awayScore": 0})
st, res = call("POST", f"/matches/{m5}/settle", token=admin_tok)
lose_sum = next((s for s in res.get("parlaySummary", []) if s.get("betId") == lose_id), None)
check("任一腿输 → 整单 lost", lose_sum is not None and lose_sum.get("outcome") == "lost", f"sum={lose_sum}")
check("输单不派彩", lose_sum is not None and (lose_sum.get("payoutAmount") or 0) == 0, f"pay={lose_sum}")

# 9. 幂等：已结算场次再 settle → 409
st, _ = call("POST", f"/matches/{m1}/settle", token=admin_tok)
check("重复结算 m1 → 409", st == 409, f"st={st}")

# 10. 汇总
passed = sum(1 for _, ok in results if ok)
print(f"\n== {passed}/{len(results)} PASS ==")
sys.exit(0 if passed == len(results) else 1)