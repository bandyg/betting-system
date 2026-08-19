#!/usr/bin/env python3
"""verify_feeds_multisport.py — SPORTBOOK 多運動 feed 驗證（2026-08-19）

驗證目標：
  1. upcoming 萬能端點：1 req 返回多種運動的場次（KBO/MLB/ATP/WTA/板球/中超等）
  2. mapper 每場按 raw.sport_key 映射（不再全部落到單一 sport）
  3. 入庫後 matches 的 sport/league 正確、源隔離不受影響
  4. /api/sports 聚合正確反映多運動
用法:
  python3 scripts/verify_feeds_multisport.py [API_BASE] [FEED_API_KEY]
  無參數時讀取 ~/.betting-feed.env
"""
import json
import os
import sys
import time
import sqlite3
import urllib.request
import urllib.error

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://100.66.5.26:4100/api"
DB = os.path.expanduser("~/services/betting-system/data/betting.db")

def load_secrets():
    env = {}
    p = os.path.expanduser("~/.betting-feed.env")
    if os.path.exists(p):
        for line in open(p):
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip()
    return env

secrets = load_secrets()
API_KEY = sys.argv[2] if len(sys.argv) > 2 else secrets.get("FEED_API_KEY", "")

results = []
def check(name, cond, detail=""):
    results.append((name, bool(cond)))
    print(("PASS" if cond else "FAIL"), name, detail)

print(f"== SPORTBOOK 多運動 feed 驗證 (base={BASE}) ==\n")

# 1. 直接調用 the-odds-api upcoming 端點（免費額度友好）
import urllib.parse
url = f"https://api.the-odds-api.com/v4/sports/upcoming/odds/?regions=eu&markets=h2h,spreads,totals&oddsFormat=decimal&dateFormat=iso&apiKey={urllib.parse.quote(API_KEY)}"
try:
    req = urllib.request.Request(url, headers={"Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as r:
        raw = json.loads(r.read().decode())
        remaining = int(r.headers.get("x-requests-remaining", -1))
    check("upcoming 端點返回多運動場次", isinstance(raw, list) and len(raw) > 0, f"count={len(raw)}")
    if isinstance(raw, list):
        sports = {}
        for m in raw:
            k = m.get("sport_key", "?")
            sports[k] = sports.get(k, 0) + 1
        check("至少 2 種運動", len(sports) >= 2, f"sports={len(sports)} {json.dumps(sports, ensure_ascii=False)[:120]}")
        check("每場都帶自己的 sport_key", all(m.get("sport_key") for m in raw), f"total={len(raw)}")
        print(f"  → 剩餘額度: {remaining}")
except Exception as e:
    check("upcoming 端點調用", False, f"err={e}")
    raw = []
    remaining = -1

# 2. 單元級驗證 mapper 對真實 payload 的每場映射（用子進程調 TS 模組）
print()
print("-- mapper 每場映射驗證（TS 單元級） --")
ts_code = '''
import { normalizeTheOddsMatch } from "APP_API_SRC/feeds/mapper.ts";
import { readFileSync } from "node:fs";
const raw = JSON.parse(readFileSync(process.argv[2], "utf8"));
const rows = raw.map((m) => {
  const ing = normalizeTheOddsMatch(m, "upcoming");
  return { id: m.id, sport_key: m.sport_key, sport: ing.sport, league: ing.league, home: ing.home, away: ing.away };
});
console.log(JSON.stringify(rows));
'''
if raw:
    sample = raw[:5]
    with open("/tmp/multisport_sample.json", "w") as f:
        json.dump(sample, f)
    api_src = os.path.abspath("apps/api/src")
    ts_code_final = ts_code.replace("APP_API_SRC", api_src.replace("\\", "/"))
    with open("/tmp/multisport_check.ts", "w") as f:
        f.write(ts_code_final + "\n")
    import subprocess
    p = subprocess.run(
        ["npx", "tsx", "/tmp/multisport_check.ts", "/tmp/multisport_sample.json"],
        capture_output=True, text=True, cwd="apps/api", timeout=60,
    )
    if p.returncode == 0:
        try:
            mapped = json.loads(p.stdout.strip().split("\n")[-1])
            ok = all(m["sport"] not in ("unknown", "upcoming") for m in mapped)
            check("mapper 每場按 raw.sport_key 映射", ok, json.dumps(mapped[:3], ensure_ascii=False)[:200])
            distinct = len(set((m["sport"], m["league"]) for m in mapped))
            check("多運動映射區分", distinct >= 2, f"distinct sport/league={distinct}")
        except Exception as e:
            check("mapper 輸出解析", False, f"err={e}")
    else:
        check("mapper TS 執行", False, f"stderr={p.stderr[:200]}")

# 3. DB 實庫檢查：feed 場次的 sport/league 是否已多樣化
print()
print("-- 資料庫現況 --")
try:
    con = sqlite3.connect(DB)
    rows = con.execute(
        "SELECT sport, league, COUNT(*) n FROM matches WHERE source='the-odds-api' GROUP BY sport, league ORDER BY n DESC"
    ).fetchall()
    if rows:
        check("feed 入庫已含多種運動", len(rows) >= 2, f"distinct sport/league={len(rows)}")
        for r in rows:
            print(f"  {r[0]}/{r[1]}: {r[2]} 場")
    else:
        check("feed 入庫已含多種運動", False, "無 the-odds-api 場次")
    con.close()
except Exception as e:
    check("DB 檢查", False, f"err={e}")

# 4. API /api/sports 聚合
print()
print("-- API /api/sports --")
try:
    req = urllib.request.Request(BASE + "/sports")
    with urllib.request.urlopen(req, timeout=15) as r:
        sports = json.loads(r.read().decode())
    total_sports = len(sports.get("sports", []))
    check("API 暴露多種運動", total_sports >= 2, f"sports={total_sports}")
    for s in sports.get("sports", []):
        print(f"  {s['sport']}: {len(s.get('leagues', []))} 聯賽, {sum(l['count'] for l in s.get('leagues', []))} 場")
except Exception as e:
    check("API /api/sports", False, f"err={e}")

passed = sum(1 for _, ok in results if ok)
print(f"\n===== {passed}/{len(results)} PASSED =====")
sys.exit(0 if passed == len(results) else 1)