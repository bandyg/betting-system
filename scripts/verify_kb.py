#!/usr/bin/env python3
"""verify_kb.py — R6 客服知识库端到端验证（隔离 DB）。

覆盖（10 asserts）：
  1. 启动迁移：5 个默认分类 + 5 篇 published FAQ
  2. GET /kb/categories — 公开，能列出 5 个分类 + article_count
  3. GET /kb/articles — 公开，能列出 5 篇文章
  4. GET /kb/articles?q=充值 — 搜索命中
  5. GET /kb/articles?category=withdraw — 按分类过滤
  6. GET /kb/articles/how-to-deposit — slug 取详情 + view_count 自增
  7. POST /kb/articles/:id/helpful 投票 — helpful_yes 自增
  8. admin POST /admin/kb/articles — 创建新文章（含 status='draft'）
  9. admin GET /admin/kb/articles?status=draft — admin 能看 draft
  10. 普通用户 GET /admin/kb/articles → 403

用法：python3 scripts/verify_kb.py [API_BASE] [DB_PATH]
默认 API_BASE=http://127.0.0.1:4100/api
"""
import os
import sys
import json
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


# admin + user tokens
st, res = call("POST", "/auth/login", body={"name": "admin", "password": "admin123"})
atoken = res.get("token") if isinstance(res, dict) else None
check("admin login", st == 200 and atoken, f"st={st}")

# 找一个非 admin user（seed 完应至少 1 个）
import sqlite3
utoken = None
if DB_PATH and os.path.exists(DB_PATH):
    con = sqlite3.connect(DB_PATH)
    rows = con.execute("SELECT name FROM users WHERE name != 'admin' ORDER BY id LIMIT 1").fetchall()
    con.close()
    if rows:
        st, res = call("POST", "/auth/login", body={"name": rows[0][0], "password": "123456"})
        utoken = res.get("token") if isinstance(res, dict) else None

# 1. GET /kb/categories
st, res = call("GET", "/kb/categories")
cats = res.get("categories", []) if isinstance(res, dict) else []
check("GET /kb/categories 200", st == 200)
check("默认 5 个分类", len(cats) >= 5, f"got={len(cats)}")
deposit_cat = next((c for c in cats if c["slug"] == "deposit"), None)
check("deposit 分类存在", deposit_cat is not None)

# 2. GET /kb/articles 默认 5 篇
st, res = call("GET", "/kb/articles")
arts = res.get("articles", []) if isinstance(res, dict) else []
check("GET /kb/articles 200", st == 200)
check("默认 5 篇文章（seed FAQ）", len(arts) >= 5, f"got={len(arts)}")
check("articles 仅含 published", all(a.get("status") == "published" for a in arts))

# 3. 搜索：q=充值 → 应命中 how-to-deposit
st, res = call("GET", "/kb/articles?q=" + "充值")
hits = res.get("articles", []) if isinstance(res, dict) else []
check("搜索 q=充值 命中", len(hits) >= 1, f"got={len(hits)}")
check("搜索 top1 = how-to-deposit", hits and hits[0].get("slug") == "how-to-deposit")

# 4. category 过滤：category=withdraw
st, res = call("GET", "/kb/articles?category=withdraw")
filtered = res.get("articles", []) if isinstance(res, dict) else []
check("category=withdraw 仅 1 篇（withdraw-time）", len(filtered) == 1 and filtered[0]["slug"] == "withdraw-time")

# 5. GET /kb/articles/how-to-deposit + view_count 自增
st, res = call("GET", "/kb/articles/how-to-deposit")
article = res.get("article") if isinstance(res, dict) else None
vc1 = article.get("view_count", 0) if article else 0
st, res = call("GET", "/kb/articles/how-to-deposit")
vc2 = (res.get("article") or {}).get("view_count", 0)
check("GET /kb/articles/:slug 200", article is not None and st == 200)
check("view_count 自增（vc2 = vc1 + 1）", vc2 == vc1 + 1, f"vc1={vc1} vc2={vc2}")

# 6. helpful 投票：yes 自增
art_id = (res.get("article") or {}).get("id") if isinstance(res, dict) else None
if art_id:
    st, res = call("POST", f"/kb/articles/{art_id}/helpful", body={"vote": "yes"})
    yes_after = res.get("helpful_yes", 0) if isinstance(res, dict) else 0
    check("POST /helpful vote=yes", st == 200 and yes_after >= 1, f"yes={yes_after}")
    st, res = call("POST", f"/kb/articles/{art_id}/helpful", body={"vote": "no"})
    no_after = res.get("helpful_no", 0) if isinstance(res, dict) else 0
    check("POST /helpful vote=no", st == 200 and no_after >= 1, f"no={no_after}")
    # 非法 vote
    st, res = call("POST", f"/kb/articles/{art_id}/helpful", body={"vote": "maybe"})
    check("非法 vote → 400", st == 400, f"st={st}")

# 7. admin 创建草稿
if atoken and deposit_cat:
    st, res = call("POST", "/admin/kb/articles", token=atoken, body={
        "category_id": deposit_cat["id"],
        "slug": "verify-kb-draft-001",
        "title": "verify 创建的草稿",
        "body": "## 测试\n\n草稿内容。",
        "tags": "verify,test",
        "status": "draft",
    })
    new_id = res.get("id") if isinstance(res, dict) else None
    check("admin POST /admin/kb/articles 创建 draft → 201", st == 201 and new_id, f"st={st} body={res}")
    # admin 看 draft
    st, res = call("GET", "/admin/kb/articles?status=draft", token=atoken)
    drafts = res.get("articles", []) if isinstance(res, dict) else []
    check("admin GET ?status=draft 看见新草稿", any(a.get("id") == new_id for a in drafts), f"drafts_count={len(drafts)}")
    # 公开端点不应返回 draft
    st, res = call("GET", "/kb/articles")
    pub = res.get("articles", []) if isinstance(res, dict) else []
    check("公开 GET /kb/articles 不返回 draft", not any(a.get("id") == new_id for a in pub))

# 8. 普通用户 GET /admin/kb/articles → 403
if utoken:
    st, res = call("GET", "/admin/kb/articles", token=utoken)
    check("普通用户 GET /admin/kb/articles → 403", st == 403, f"st={st}")

# 9. admin slug 重复 → 409
if atoken and deposit_cat:
    st, res = call("POST", "/admin/kb/articles", token=atoken, body={
        "category_id": deposit_cat["id"],
        "slug": "how-to-deposit",  # seed 已存在
        "title": "重复 slug",
        "body": "x",
    })
    check("slug 重复 → 409", st == 409, f"st={st}")

# 10. anonymous GET /admin/kb/categories → 401
st, res = call("GET", "/admin/kb/categories")
check("anon GET /admin/kb/categories → 401", st == 401, f"st={st}")

passed = sum(1 for _, ok in results if ok)
print(f"\n===== {passed}/{len(results)} PASSED =====")
sys.exit(0 if passed == len(results) else 1)