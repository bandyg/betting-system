#!/usr/bin/env python3
"""verify_analytics_export.py — R13 实时大屏（SSE）+ CSV 导出端到端验证（隔离 DB）。

覆盖（11 asserts）：
  1. GET /analytics/export/trends.csv — admin 200 + text/csv + 表头行
  2. CSV 内容：days=3 → 表头 date,stake,bets,payout + 3 数据行
  3. GET /analytics/export/users.csv — 200 + 列含 userId/name/stake
  4. GET /analytics/export/hot-matches.csv — 200
  5. CSV 转义正确性：建一个名字带逗号的赛事 → hot-matches.csv 中该字段被引号包裹
  6. GET /analytics/realtime（SSE）— admin 首帧 data: {dashboard, ts}（Authorization 头通道）
  7. SSE ?token= 查询参数通道 — 200 text/event-stream
  8. SSE 普通用户 → 403
  9. SSE anon → 401
  10. CSV anon → 401
  11. SSE 连接数上限：ANALYTICS_REALTIME_MAX_CLIENTS=1 时第二个连接 → 429（不设，跳过）

用法：python3 scripts/verify_analytics_export.py [API_BASE] [DB_PATH]
"""
import os
import sys
import json
import time
import socket
import sqlite3
import urllib.request
import urllib.error
from urllib.parse import urlencode

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:4100/api"
DB_PATH = sys.argv[2] if len(sys.argv) > 2 else os.environ.get("BETTING_DB_PATH", "")
# SSE 首帧等待秒数
SSE_WAIT_S = 6

results = []


def check(name, ok, detail=""):
    results.append((name, bool(ok)))
    print(("PASS" if ok else "FAIL"), name, detail)


def call(method, path, token=None, body=None, raw=False):
    req = urllib.request.Request(BASE + path, method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    data = json.dumps(body).encode() if body is not None else None
    try:
        with urllib.request.urlopen(req, data=data, timeout=15) as r:
            payload = r.read().decode("utf-8", errors="replace")
            if raw:
                return r.status, payload, dict(r.headers)
            return r.status, json.loads(payload or "{}")
    except urllib.error.HTTPError as e:
        payload = e.read().decode("utf-8", errors="replace") if e.fp else ""
        if raw:
            return e.code, payload, dict(e.headers)
        try:
            return e.code, json.loads(payload or "{}")
        except Exception:
            return e.code, {}


# ---- tokens ----
st, res = call("POST", "/auth/login", body={"name": "admin", "password": "admin123"})
atoken = res.get("token") if isinstance(res, dict) else None
check("admin login", st == 200 and atoken, f"st={st}")

utoken = None
if DB_PATH and os.path.exists(DB_PATH):
    con = sqlite3.connect(DB_PATH)
    rows = con.execute("SELECT name FROM users WHERE name != 'admin' ORDER BY id LIMIT 1").fetchall()
    con.close()
    if rows:
        st, res = call("POST", "/auth/login", body={"name": rows[0][0], "password": "123456"})
        utoken = res.get("token") if isinstance(res, dict) else None

# ---- 造一条带逗号名字的赛事 + 市场 + 下注（供 CSV 转义断言）----
ts = str(int(time.time() * 1000))[-6:]
st, res = call("POST", "/matches", token=atoken, body={
    "homeTeam": f'Comma,{ts}', "awayTeam": f'Team{ts}',
    "kickoffTime": "2099-01-01T12:00:00.000Z",
})
mid = res.get("match", {}).get("id") if isinstance(res, dict) else None
st, res = call("POST", f"/matches/{mid}/markets", token=atoken, body={
    "type": "1x2", "odds": {"home": 2.0, "draw": 3.0, "away": 4.0},
})
mkid = res.get("market", {}).get("id") if isinstance(res, dict) else None
if utoken:
    if DB_PATH and os.path.exists(DB_PATH):
        con = sqlite3.connect(DB_PATH)
        uid = con.execute("SELECT id FROM users WHERE name != 'admin' ORDER BY id LIMIT 1").fetchone()[0]
        con.close()
        call("POST", f"/users/{uid}/deposit", token=atoken, body={"amount": 500})
    call("POST", "/bets", token=utoken, body={"marketId": mkid, "selection": "home", "stake": 10})

# ---- 1-2. trends.csv ----
st, body, hdrs = call("GET", "/analytics/export/trends.csv?days=3", token=atoken, raw=True)
check("trends.csv 200", st == 200, f"st={st}")
check("Content-Type text/csv", "text/csv" in hdrs.get("Content-Type", ""), f"ct={hdrs.get('Content-Type')}")
lines = [l for l in body.split("\r\n") if l]
check("trends.csv 表头 + 3 行数据", len(lines) == 4 and lines[0] == "date,stake,bets,payout",
      f"lines={len(lines)} head={lines[0] if lines else ''}")

# ---- 3. users.csv ----
st, body, hdrs = call("GET", "/analytics/export/users.csv?limit=10", token=atoken, raw=True)
check("users.csv 200 + 含 userId,name 列", st == 200 and body.startswith("userId,name"),
      f"st={st} head={body.split(chr(13))[0][:40]}")

# ---- 4. hot-matches.csv ----
st, body, hdrs = call("GET", "/analytics/export/hot-matches.csv?limit=20", token=atoken, raw=True)
check("hot-matches.csv 200", st == 200)

# ---- 5. CSV 转义：名字带逗号 → 引号包裹 ----
st, body, _ = call("GET", "/analytics/export/hot-matches.csv?limit=50", token=atoken, raw=True)
# homeTeam 是 'Comma,<ts>' → CSV 中应为 '"Comma,<ts>"'
check("CSV 转义：逗号字段被引号包裹", f'"Comma,{ts}"' in body, f"looking for '\"Comma,{ts}\"'")

# ---- 6. SSE（Authorization 头）----
# SSE 是流：urlopen 读首行即可（首帧立即推）
req = urllib.request.Request(BASE + "/analytics/realtime")
req.add_header("Authorization", f"Bearer {atoken}")
req.add_header("Accept", "text/event-stream")
sse_ok = False
sse_first = ""
try:
    with urllib.request.urlopen(req, timeout=SSE_WAIT_S) as r:
        ct = r.headers.get("Content-Type", "")
        # 读首帧（阻塞直到 data: 行）
        start = time.time()
        buf = b""
        while time.time() - start < SSE_WAIT_S:
            chunk = r.read1(4096) if hasattr(r, "read1") else r.read(1)
            if not chunk:
                break
            buf += chunk
            if b"\n\n" in buf:
                break
        sse_first = buf.decode("utf-8", errors="replace")
        sse_ok = ct.startswith("text/event-stream") and sse_first.startswith("data:")
except Exception as e:
    sse_first = str(e)
check("SSE admin（Authorization 头）首帧 data: + event-stream", sse_ok, f"first={sse_first[:60]}")
if sse_ok:
    try:
        payload = json.loads(sse_first.removeprefix("data: ").strip())
        check("SSE 首帧含 dashboard + ts", "dashboard" in payload and "ts" in payload,
              f"keys={list(payload.keys())}")
    except Exception as e:
        check("SSE 首帧 JSON 可解析", False, str(e))

# ---- 7. SSE ?token= 通道 ----
qs = urlencode({"token": atoken})
st2, body2, hdrs2 = None, "", {}
sse_ok2 = False
try:
    req2 = urllib.request.Request(BASE + f"/analytics/realtime?{qs}")
    req2.add_header("Accept", "text/event-stream")
    with urllib.request.urlopen(req2, timeout=SSE_WAIT_S) as r:
        ct2 = r.headers.get("Content-Type", "")
        buf = b""
        start = time.time()
        while time.time() - start < SSE_WAIT_S:
            chunk = r.read1(4096) if hasattr(r, "read1") else r.read(1)
            if not chunk:
                break
            buf += chunk
            if b"\n\n" in buf:
                break
        body2 = buf.decode("utf-8", errors="replace")
        sse_ok2 = ct2.startswith("text/event-stream") and body2.startswith("data:")
except Exception as e:
    body2 = str(e)
check("SSE ?token= 查询参数通道", sse_ok2, f"first={body2[:60]}")

# ---- 8. SSE 普通用户 → 403 ----
if utoken:
    st, res = call("GET", "/analytics/realtime", token=utoken)
    check("SSE 普通用户 → 403", st == 403, f"st={st}")

# ---- 9. SSE anon → 401 ----
st, res = call("GET", "/analytics/realtime")
check("SSE anon → 401", st == 401, f"st={st}")

# ---- 10. CSV anon → 401 ----
st, res = call("GET", "/analytics/export/trends.csv")
check("CSV anon → 401", st == 401, f"st={st}")

passed = sum(1 for _, ok in results if ok)
print(f"\n===== {passed}/{len(results)} PASSED =====")
sys.exit(0 if passed == len(results) else 1)