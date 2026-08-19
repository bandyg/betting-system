#!/usr/bin/env python3
"""verify_cms.py — CMS 内容生命周期验证（2026-08-20）

验证目标：
  1. 权限：匿名 401 / 普通用户 / admin 访问控制（创建/编辑/发布/下架/归档）
  2. 创建：默认草稿；带 publish_at → scheduled；非法时间 400
  3. 定时发布：scheduled 内容对匿名不可见；到点后（惰性 flush）自动 published 且可见
  4. 下架：published → draft，匿名不可见
  5. 归档：published → archived 带 archived_at；归档内容不可发布 409；restore 恢复草稿
  6. 单条可见性：draft/scheduled/archived 仅 admin 可见；published 公开
  7. 幂等：重复下架/归档 409
用法:
  python3 scripts/verify_cms.py [API_BASE] [DB_PATH]
"""
import json
import os
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


print(f"== CMS 内容生命周期验证 (base={BASE}, db={DB}) ==\n")

# 0. 账号准备
bob_name, bob_id, bob_tok = ensure_user("cms_bob")
check("用户注册/登录", bob_id is not None and bool(bob_tok))
st, res = call("POST", "/auth/login", body={"name": "admin", "password": "admin123"})
admin_tok = res.get("token")
check("admin 登录", st == 200 and bool(admin_tok))

# 1. 权限
st, _ = call("POST", "/cms/contents", body={"title": "x", "type": "announcement"})
check("匿名创建内容 → 401", st == 401, f"st={st}")
st, _ = call("POST", "/cms/contents", token=bob_tok, body={"title": "x", "type": "announcement"})
check("普通用户创建内容 → 403", st == 403, f"st={st}")
st, _ = call("GET", "/cms/contents", token=bob_tok)
check("普通用户查全部内容 → 403", st == 403, f"st={st}")

# 2. 创建：默认草稿；非法 type/时间
st, res = call("POST", "/cms/contents", token=admin_tok, body={"title": "", "type": "announcement"})
check("空标题 → 400", st == 400, f"st={st}")
st, res = call("POST", "/cms/contents", token=admin_tok, body={"title": "a", "type": "bogus"})
check("非法 type → 400", st == 400, f"st={st}")
st, res = call("POST", "/cms/contents", token=admin_tok, body={"title": "a", "type": "announcement", "publish_at": "not-a-time"})
check("非法 publish_at → 400", st == 400, f"st={st}")
st, res = call("POST", "/cms/contents", token=admin_tok, body={"title": "draft公告", "type": "announcement", "body": "草稿正文"})
draft_id = res.get("content", {}).get("id")
check("创建默认草稿 → 201", st == 201 and res.get("content", {}).get("status") == "draft", f"id={draft_id}")

# 3. 可见性：草稿对匿名不可见（列表 + 单条）
st, res = call("GET", "/cms/contents?status=published")
anon_ids = {c["id"] for c in res.get("contents", [])}
check("草稿不出现在公开列表", draft_id not in anon_ids, f"draft_id={draft_id}")
st, res = call("GET", f"/cms/contents/{draft_id}")
check("匿名读草稿单条 → 403", st == 403, f"st={st}")
st, res = call("GET", f"/cms/contents/{draft_id}", token=admin_tok)
check("admin 读草稿单条 → 200", st == 200 and res.get("content", {}).get("status") == "draft", f"st={st}")

# 4. 立即发布 → 公开可见
st, res = call("POST", f"/cms/contents/{draft_id}/publish", token=admin_tok)
check("admin 发布 → published", st == 200 and res.get("content", {}).get("status") == "published", f"st={st}")
st, res = call("GET", f"/cms/contents/{draft_id}")
check("发布后匿名可读 → 200", st == 200 and res.get("content", {}).get("status") == "published", f"st={st}")

# 5. 下架 → 匿名不可见；重复下架 409
st, res = call("POST", f"/cms/contents/{draft_id}/unpublish", token=admin_tok)
check("下架 → draft", st == 200 and res.get("content", {}).get("status") == "draft", f"st={st}")
st, _ = call("GET", f"/cms/contents/{draft_id}")
check("下架后匿名读 → 403", st == 403, f"st={st}")
st, _ = call("POST", f"/cms/contents/{draft_id}/unpublish", token=admin_tok)
check("重复下架 → 409", st == 409, f"st={st}")

# 6. 定时发布：未来时间 → scheduled，公开不可见
st, res = call("POST", "/cms/contents", token=admin_tok, body={
    "title": "定时公告", "type": "announcement", "body": "定时内容",
    "publish_at": "2099-01-01 00:00:00",
})
sched_id = res.get("content", {}).get("id")
check("创建带 publish_at → scheduled", st == 201 and res.get("content", {}).get("status") == "scheduled", f"id={sched_id}")
st, res = call("GET", f"/cms/contents/{sched_id}")
check("定时内容匿名读 → 403", st == 403, f"st={st}")
st, res = call("GET", "/cms/contents?status=scheduled", token=admin_tok)
sched_ids = {c["id"] for c in res.get("contents", [])}
check("admin 查 scheduled 列表含该内容", sched_id in sched_ids, f"id={sched_id}")

# 7. 定时到点 → 惰性 flush 自动发布
st, res = call("POST", "/cms/contents", token=admin_tok, body={
    "title": "到点公告", "type": "announcement", "body": "自动发布",
    "publish_at": "2000-01-01 00:00:00",
})
due_id = res.get("content", {}).get("id")
st, res = call("GET", "/cms/contents?status=published")
due_published = any(c["id"] == due_id and c["status"] == "published" for c in res.get("contents", []))
check("到点定时内容自动发布并公开", st == 200 and due_published, f"id={due_id}")

# 8. 归档：published → archived；归档后匿名 403；归档内容不可发布 409；restore 恢复
st, res = call("POST", f"/cms/contents/{due_id}/archive", token=admin_tok)
arch = res.get("content", {})
check("归档 → archived 带 archived_at", st == 200 and arch.get("status") == "archived" and bool(arch.get("archived_at")), f"st={st}")
st, _ = call("GET", f"/cms/contents/{due_id}")
check("归档后匿名读 → 403", st == 403, f"st={st}")
st, _ = call("POST", f"/cms/contents/{due_id}/archive", token=admin_tok)
check("重复归档 → 409", st == 409, f"st={st}")
st, _ = call("POST", f"/cms/contents/{due_id}/publish", token=admin_tok)
check("归档内容发布 → 409", st == 409, f"st={st}")
st, res = call("POST", f"/cms/contents/{due_id}/restore", token=admin_tok)
check("restore → draft 且清 archived_at", st == 200 and res.get("content", {}).get("status") == "draft" and not res.get("content", {}).get("archived_at"), f"st={st}")

# 9. 编辑：PUT 支持改 publish_at 进入 scheduled；清空 publish_at 回 draft
st, res = call("PUT", f"/cms/contents/{draft_id}", token=admin_tok, body={"title": "改标题", "publish_at": "2099-01-01 00:00:00"})
check("编辑设 publish_at → scheduled", st == 200 and res.get("content", {}).get("status") == "scheduled" and res.get("content", {}).get("title") == "改标题", f"st={st}")
st, res = call("PUT", f"/cms/contents/{draft_id}", token=admin_tok, body={"publish_at": None})
check("编辑清 publish_at → draft", st == 200 and res.get("content", {}).get("status") == "draft" and res.get("content", {}).get("publish_at") is None, f"st={st}")
st, _ = call("PUT", f"/cms/contents/{draft_id}", token=bob_tok, body={"title": "x"})
check("普通用户编辑 → 403", st == 403, f"st={st}")

# 10. 非 admin 不能下架/归档
st, res = call("POST", "/cms/contents", token=admin_tok, body={"title": "临时", "type": "announcement"})
tmp_id = res.get("content", {}).get("id")
call("POST", f"/cms/contents/{tmp_id}/publish", token=admin_tok)
st, _ = call("POST", f"/cms/contents/{tmp_id}/unpublish", token=bob_tok)
check("普通用户下架 → 403", st == 403, f"st={st}")
st, _ = call("POST", f"/cms/contents/{tmp_id}/archive", token=bob_tok)
check("普通用户归档 → 403", st == 403, f"st={st}")

# 11. 归档内容不出现在公开列表
st, res = call("POST", f"/cms/contents/{tmp_id}/archive", token=admin_tok)
st, res = call("GET", "/cms/contents?status=published")
pub_ids = {c["id"] for c in res.get("contents", [])}
check("归档内容不在公开列表", tmp_id not in pub_ids, f"id={tmp_id}")

passed = sum(1 for _, ok in results if ok)
print(f"\n== 结果: {passed}/{len(results)} PASS ==")
sys.exit(0 if passed == len(results) else 1)