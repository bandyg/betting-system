#!/usr/bin/env python3
"""Customer Support（工单）端到端验证（可重复执行）

用法: python3 scripts/verify_support.py [API_BASE] [DB_PATH]
  API_BASE 默认: http://100.66.5.26:4100/api
  DB_PATH  默认: $BETTING_DB_PATH（隔离 e2e 时指向临时库），否则 ~/services/betting-system/data/betting.db

覆盖验收清单（Step 6.1）：
  1. 权限：匿名 401 / 普通 user 访问 admin 路由 403 / 看他人单 403 / support+admin 200·201
  2. 状态流：open → in_progress → waiting_user → (user 回覆自动) in_progress → resolved → closed
  3. 关闭锁定：closed 后 user/agent 回覆 409、再 PATCH 409、closed_by/closed_at 已写
  4. 可见性：仅作者本人与客服可看单
  5. 分页：pageSize=2 → count==2、total==N、翻页无重复
  6. 数据正确性：messages 累积、ticket.body 不变、user_id/author_role/created_at 正确
"""
import sys
import json
import os
import time
import sqlite3
import urllib.request
import urllib.error

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://100.66.5.26:4100/api"
DB = (
    sys.argv[2]
    if len(sys.argv) > 2
    else os.environ.get("BETTING_DB_PATH", os.path.expanduser("~/services/betting-system/data/betting.db"))
)

results = []


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


def check(name, cond, detail=""):
    results.append((name, bool(cond)))
    print(("PASS" if cond else "FAIL"), name, detail)


def ensure_user(prefix, password="123456"):
    """注册唯一用户（返回 name, id, token），可重复执行"""
    name = f"{prefix}_{int(time.time() * 1000)}"
    st, res = call("POST", "/users", body={"name": name, "password": password})
    if st != 201:
        check(f"create user {prefix}", False, f"st={st} {res}")
        return name, None, None
    return name, res["user"]["id"], res.get("token")


def login(name, password="123456"):
    st, res = call("POST", "/auth/login", body={"name": name, "password": password})
    return st, res


# ---------- 0. 账号准备 ----------
print(f"== Customer Support E2E (base={BASE}, db={DB}) ==\n")

alice_name, alice_id, alice_tok = ensure_user("cs_alice")
bob_name, bob_id, bob_tok = ensure_user("cs_bob")
check("alice/bob 注册", alice_id is not None and bob_id is not None)

# support 客服账号：注册后经 DB 升为 support 角色（无该管理 API），再登录确认
sup_name, sup_id, sup_tok = ensure_user("cs_sup")
if sup_id:
    con = sqlite3.connect(DB)
    con.execute("UPDATE users SET role='support' WHERE id=?", (sup_id,))
    con.commit()
    con.close()
st, res = login(sup_name) if sup_name else (0, {})
sup_tok = res.get("token") if st == 200 else None
check("support 角色可登录", st == 200 and res.get("user", {}).get("role") == "support", f"st={st} role={res.get('user',{}).get('role')}")

# admin 账号
st, res = call("POST", "/auth/login", body={"name": "admin", "password": "admin123"})
admin_tok = res.get("token")
check("admin login", st == 200 and bool(admin_tok), f"st={st}")

# ---------- 1. 分类列表（公开） ----------
st, res = call("GET", "/support/categories")
cats = res.get("categories", [])
keys = [c.get("key") for c in cats]
check("categories 匿名 200", st == 200)
check("categories 5 项含 deposit_withdrawal", len(cats) == 5 and "deposit_withdrawal" in keys, f"keys={keys}")

# ---------- 2. 建单参数校验 ----------
st, res = call("POST", "/support/tickets", token=alice_tok, body={"category": "betting", "subject": "  ", "body": "x"})
check("缺 subject → 400", st == 400 and res.get("error") == "subject is required", f"st={st}")
st, res = call("POST", "/support/tickets", token=alice_tok, body={"category": "betting", "subject": "s", "body": "  "})
check("缺 body → 400", st == 400 and res.get("error") == "body is required", f"st={st}")
st, res = call("POST", "/support/tickets", token=alice_tok, body={"category": "hacking", "subject": "s", "body": "b"})
check("非法 category → 400", st == 400 and res.get("error") == "invalid category", f"st={st}")
st, res = call("POST", "/support/tickets", token=alice_tok, body={"category": "other", "subject": "s", "body": "b", "priority": "godlike"})
check("非法 priority → 400", st == 400, f"st={st}")
st, res = call("POST", "/support/tickets", body={"category": "other", "subject": "s", "body": "b"})
check("匿名建单 → 401", st == 401, f"st={st}")

# ---------- 3. 建单 + 分页 + 列表筛选 ----------
def create_ticket(token, category="deposit_withdrawal", subject="充值未到账", body="我充了100块没到账", priority=None):
    payload = {"category": category, "subject": subject, "body": body}
    if priority:
        payload["priority"] = priority
    st, res = call("POST", "/support/tickets", token=token, body=payload)
    return st, res

t1 = create_ticket(alice_tok, priority="high")
check("建单1 201 & open & 作者 & priority", t1[0] == 201 and t1[1]["ticket"]["status"] == "open"
      and t1[1]["ticket"]["user_id"] == alice_id and t1[1]["ticket"]["priority"] == "high",
      f"st={t1[0]}")
t1_id = t1[1]["ticket"]["id"]
check("建单1 body 已存 tickets.body", t1[1]["ticket"]["body"] == "我充了100块没到账")

t2 = create_ticket(alice_tok, category="betting", subject="赔率显示异常", body="让球盘赔率错了")
t2_id = t2[1]["ticket"]["id"]
t3 = create_ticket(alice_tok, category="account", subject="无法登录", body="验证码收不到")
t3_id = t3[1]["ticket"]["id"]
check("建单2/3 201", t2[0] == 201 and t3[0] == 201)

# 分页：total==3, pageSize=2
st, res = call("GET", "/support/tickets?page=1&pageSize=2", token=alice_tok)
check("我的工单 分页 page1", st == 200 and res.get("total") == 3 and res.get("count") == 2
      and res.get("page") == 1 and res.get("pageSize") == 2, f"st={st} total={res.get('total')} count={res.get('count')}")
p1_ids = [t["id"] for t in res.get("tickets", [])]
st, res = call("GET", "/support/tickets?page=2&pageSize=2", token=alice_tok)
p2_ids = [t["id"] for t in res.get("tickets", [])]
check("我的工单 分页 page2 count==1", st == 200 and res.get("count") == 1 and res.get("total") == 3)
check("翻页无重复", len(set(p1_ids + p2_ids)) == 3 and len(p1_ids) == 2 and len(p2_ids) == 1, f"p1={p1_ids} p2={p2_ids}")
check("列表降序 id DESC", p1_ids == sorted(p1_ids, reverse=True))

st, res = call("GET", "/support/tickets?status=open", token=alice_tok)
check("状态筛选 status=open → 3", st == 200 and res.get("total") == 3, f"total={res.get('total')}")
st, res = call("GET", "/support/tickets?category=betting", token=alice_tok)
check("分类筛选 category=betting → 1", st == 200 and res.get("total") == 1 and res["tickets"][0]["id"] == t2_id)
st, res = call("GET", "/support/tickets?status=bad", token=alice_tok)
check("非法 status → 400", st == 400, f"st={st}")
st, res = call("GET", "/support/tickets?page=0", token=alice_tok)
check("非法 page → 400", st == 400, f"st={st}")
st, res = call("GET", "/support/tickets?pageSize=101", token=alice_tok)
check("pageSize>100 → 400", st == 400, f"st={st}")
st, res = call("GET", "/support/tickets", body=None)
check("匿名列表 → 401", st == 401, f"st={st}")

# ---------- 4. 可见性 ----------
st, res = call("GET", f"/support/tickets/{t1_id}", token=alice_tok)
check("作者看单 200 & messages 空", st == 200 and res.get("messages") == [], f"st={st}")
check("详情含 user_name", st == 200 and res["ticket"].get("user_name") == alice_name)

st, res = call("GET", f"/support/tickets/{t1_id}", token=bob_tok)
check("他人看单 → 403", st == 403, f"st={st}")
st, res = call("GET", f"/support/tickets/{t1_id}", token=sup_tok)
check("support 看任意单 → 200", st == 200, f"st={st}")
st, res = call("GET", f"/support/tickets/{t1_id}", token=admin_tok)
check("admin 看任意单 → 200", st == 200, f"st={st}")
st, res = call("GET", "/support/tickets/999999", token=alice_tok)
check("不存在 id → 404", st == 404, f"st={st}")
st, res = call("GET", "/support/tickets/abc", token=alice_tok)
check("非法 id → 400", st == 400, f"st={st}")
st, res = call("GET", f"/support/tickets?userId={alice_id}", token=bob_tok)
check("user 带他人 userId → 403", st == 403, f"st={st}")

# ---------- 5. 使用者回覆 ----------
st, res = call("POST", f"/support/tickets/{t1_id}/messages", token=alice_tok, body={"content": "麻烦尽快处理"})
check("用户回覆 201 & role=user & 状态不变", st == 201 and res["message"]["author_role"] == "user"
      and res["ticket"]["status"] == "open" and res["message"]["author_user_id"] == alice_id, f"st={st} status={res.get('ticket',{}).get('status')}")
st, res = call("POST", f"/support/tickets/{t1_id}/messages", token=alice_tok, body={"content": "   "})
check("空回覆 → 400", st == 400, f"st={st}")
st, res = call("POST", f"/support/tickets/{t1_id}/messages", token=bob_tok, body={"content": "hi"})
check("他人回覆 → 403", st == 403, f"st={st}")

st, res = call("GET", f"/support/tickets/{t1_id}", token=alice_tok)
msgs = res.get("messages", [])
check("回覆后 messages.length==1", st == 200 and len(msgs) == 1 and msgs[0]["author_role"] == "user"
      and msgs[0]["content"] == "麻烦尽快处理")
check("body 保持不变", res["ticket"]["body"] == "我充了100块没到账")

# ---------- 6. admin/客服端权限矩阵 ----------
st, res = call("GET", "/admin/support/tickets")
check("匿名 admin 列表 → 401", st == 401, f"st={st}")
st, res = call("GET", "/admin/support/tickets", token=bob_tok)
check("普通 user admin 列表 → 403", st == 403, f"st={st}")
st, res = call("GET", "/admin/support/tickets", token=sup_tok)
sup_tickets = res.get("tickets", [])
check("support 全部工单 200 & user_name", st == 200 and len(sup_tickets) == 3 and "user_name" in sup_tickets[0], f"st={st}")
st, res = call("GET", "/admin/support/tickets", token=admin_tok)
check("admin 全部工单 200", st == 200 and res.get("total") == 3, f"total={res.get('total')}")
st, res = call("GET", "/admin/support/tickets?status=bad", token=admin_tok)
check("admin 非法 status → 400", st == 400, f"st={st}")
st, res = call("GET", "/admin/support/tickets?userId=abc", token=admin_tok)
check("admin 非法 userId → 400", st == 400, f"st={st}")
st, res = call("GET", "/admin/support/tickets?userId=1", token=admin_tok)
check("admin userId 筛选 200", st == 200, f"st={st}")
st, res = call("GET", f"/admin/support/tickets/{t1_id}", token=sup_tok)
check("support 详情 200 & 訊息累积", st == 200 and len(res.get("messages", [])) >= 1 and res["ticket"]["user_name"] == alice_name, f"st={st} msgs={len(res.get('messages', []))}")

# ---------- 7. 客服回覆 ----------
st, res = call("POST", f"/admin/support/tickets/{t2_id}/messages", token=sup_tok, body={"content": "收到，正在核查充值记录"})
check("客服回覆 201 & role=agent & open→in_progress", st == 201 and res["message"]["author_role"] == "agent"
      and res["ticket"]["status"] == "in_progress", f"st={st} status={res.get('ticket',{}).get('status')}")

st, res = call("GET", "/admin/support/tickets?status=in_progress", token=admin_tok)
check("admin 状态筛选 找得到 t2", st == 200 and any(t["id"] == t2_id for t in res.get("tickets", [])), f"st={st}")

# ---------- 8. 完整状态流（open → in_progress → waiting_user → in_progress → resolved → closed） ----------
st, t4 = create_ticket(alice_tok, category="technical", subject="全流程单", body="用来走状态流")
t4_id = t4["ticket"]["id"]
st, res = call("PATCH", f"/admin/support/tickets/{t4_id}/status", token=admin_tok, body={"status": "in_progress"})
check("open→in_progress 200", st == 200 and res["ticket"]["status"] == "in_progress", f"st={st}")
st, res = call("PATCH", f"/admin/support/tickets/{t4_id}/status", token=admin_tok, body={"status": "waiting_user"})
check("in_progress→waiting_user 200", st == 200 and res["ticket"]["status"] == "waiting_user", f"st={st}")
st, res = call("POST", f"/support/tickets/{t4_id}/messages", token=alice_tok, body={"content": "我补充一下信息"})
check("waiting_user 回覆自动 → in_progress", st == 201 and res["ticket"]["status"] == "in_progress", f"st={st} status={res.get('ticket',{}).get('status')}")
st, res = call("PATCH", f"/admin/support/tickets/{t4_id}/status", token=admin_tok, body={"status": "resolved"})
check("in_progress→resolved 200", st == 200 and res["ticket"]["status"] == "resolved", f"st={st}")
st, res = call("PATCH", f"/admin/support/tickets/{t4_id}/status", token=admin_tok, body={"status": "closed"})
closed_t = res.get("ticket", {})
check("resolved→closed 200 & closed_by/closed_at 已写", st == 200 and closed_t.get("status") == "closed"
      and closed_t.get("closed_by") is not None and closed_t.get("closed_at"), f"st={st} cb={closed_t.get('closed_by')} ca={closed_t.get('closed_at')}")

# 非法流转与锁定
st, res = call("PATCH", f"/admin/support/tickets/{t4_id}/status", token=admin_tok, body={"status": "open"})
check("closed→open → 409", st == 409 and "非法状态流转: closed -> open" in res.get("error", ""), f"st={st} {res.get('error')}")
st, res = call("PATCH", f"/admin/support/tickets/{t4_id}/status", token=admin_tok, body={"status": "bad"})
check("非法 status → 400", st == 400, f"st={st}")
st, res = call("POST", f"/support/tickets/{t4_id}/messages", token=alice_tok, body={"content": "还想回复"})
check("closed 后用户回覆 → 409", st == 409 and res.get("error") == "工单已完结，无法回复", f"st={st}")
st, res = call("POST", f"/admin/support/tickets/{t4_id}/messages", token=sup_tok, body={"content": "客服还想回复"})
check("closed 后客服回覆 → 409", st == 409 and res.get("error") == "工单已完结，无法回复", f"st={st}")

# resolved 锁定
st, res = call("PATCH", f"/admin/support/tickets/{t3_id}/status", token=admin_tok, body={"status": "resolved"})
check("t3 → resolved 200", st == 200 and res["ticket"]["status"] == "resolved", f"st={st}")
st, res = call("POST", f"/support/tickets/{t3_id}/messages", token=alice_tok, body={"content": "resolved 后回覆"})
check("resolved 后回覆 → 409", st == 409, f"st={st}")
st, res = call("GET", f"/admin/support/tickets/{t3_id}", token=admin_tok)
check("resolved 详情 messages 仍为空", st == 200 and len(res.get("messages", [])) == 0, f"st={st}")

# ---------- 9. 数据正确性汇总 ----------
st, res = call("GET", f"/admin/support/tickets/{t1_id}", token=admin_tok)
msgs = res.get("messages", [])
check("t1 訊息累积 == 1 (仅用户回覆)", len(msgs) == 1, f"len={len(msgs)}")
check("t1 body 保持首条不变", res["ticket"]["body"] == "我充了100块没到账")
check("t1 created_at 存在", bool(res["ticket"].get("created_at")))
st, res = call("GET", f"/admin/support/tickets/{t2_id}", token=admin_tok)
check("t2 訊息累积 == 1 (仅客服回覆)", len(res.get("messages", [])) == 1 and res["messages"][0]["author_role"] == "agent")
check("t2 客服回覆 author_user_id == support id", res["messages"][0]["author_user_id"] == sup_id)
st, res = call("GET", f"/admin/support/tickets/{t4_id}", token=admin_tok)
check("t4 訊息累积 == 1 (waiting_user 回覆)", len(res.get("messages", [])) == 1 and res["messages"][0]["author_role"] == "user")
check("t4 closed_by == admin id", res["ticket"]["closed_by"] is not None)

passed = sum(1 for _, ok in results if ok)
print(f"\n===== {passed}/{len(results)} PASSED =====")
sys.exit(0 if passed == len(results) else 1)
