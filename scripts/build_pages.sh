#!/usr/bin/env bash
# build_pages.sh — 构建 GitHub Pages 静态产物
#
# 产物结构（_pages/，由 .github/workflows/pages.yml 调用）：
#   index.html              ← docs/index.template.html（落地页）
#   storybook/              ← docs/storybook/*，其中 *.md 渲染为同名 *.html
#   visual-baseline/*.png   ← docs/visual-baseline/*
#
# 为什么 md→html：Pages artifact 部署不经 Jekyll，.md 原样输出浏览器无法阅读；
# 落地页与 storybook 导航链向 *.html，此前这些链接全部 404（且 storybook 自身
# 的 index.html 会被落地页覆盖）——本脚本一并修复。
#
# 用法：bash scripts/build_pages.sh [输出目录]（默认 _pages）
set -euo pipefail

OUT="${1:-_pages}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

rm -rf "$OUT"
mkdir -p "$OUT/storybook" "$OUT/visual-baseline"

cp docs/index.template.html "$OUT/index.html"
cp docs/visual-baseline/*.png "$OUT/visual-baseline/"
cp docs/storybook/index.html "$OUT/storybook/index.html"

# 每篇 md → 同名 html（marked 渲染 + 统一暗色外壳）
# 页壳内嵌于本脚本，含 {{TITLE}}/{{BODY}}/{{BACK}} 三个占位。
PAGE_TEMPLATE="$(mktemp)"
trap 'rm -f "$PAGE_TEMPLATE" "$PAGE_TEMPLATE.body" "$PAGE_TEMPLATE.clean"' EXIT
cat > "$PAGE_TEMPLATE" <<'EOF'
<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>{{TITLE}} — Betting Storybook</title>
  <style>
    :root { --bg:#0f0f1e; --bg-card:#1a1a2e; --bg-card-2:#232342; --fg:#e6e6f0; --fg-muted:#8888aa; --border:#333355; --accent:#6c63ff; }
    * { box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif; margin:0; background:var(--bg); color:var(--fg); }
    .wrap { max-width: 860px; margin: 0 auto; padding: 32px 24px 64px; }
    .crumb { font-size: 13px; margin-bottom: 24px; }
    .crumb a { color: var(--accent); text-decoration: none; }
    .crumb a:hover { text-decoration: underline; }
    h1 { font-size: 28px; margin: 0 0 8px; }
    h2 { font-size: 20px; margin: 32px 0 12px; padding-bottom: 8px; border-bottom: 1px solid var(--border); }
    h3 { font-size: 16px; margin: 24px 0 10px; }
    h4 { font-size: 14px; margin: 18px 0 8px; color: var(--accent); }
    p, li { line-height: 1.7; color: var(--fg-muted); font-size: 14px; }
    li { margin: 4px 0; }
    a { color: var(--accent); }
    strong { color: var(--fg); }
    code { background: var(--bg-card-2); padding: 2px 6px; border-radius: 3px; font-family: ui-monospace, Consolas, monospace; font-size: 13px; color: #b8c2ff; }
    pre { background: var(--bg-card-2); padding: 14px; border-radius: 6px; overflow-x: auto; border: 1px solid var(--border); }
    pre code { background: transparent; padding: 0; color: var(--fg); }
    table { border-collapse: collapse; width: 100%; margin: 16px 0; font-size: 13px; }
    th, td { padding: 8px 12px; text-align: left; border-bottom: 1px solid var(--border); }
    th { background: var(--bg-card-2); color: var(--accent); font-weight: 600; }
    td { color: var(--fg-muted); }
    blockquote { margin: 12px 0; padding: 8px 16px; border-left: 3px solid var(--accent); background: var(--bg-card); color: var(--fg-muted); }
    hr { border: none; border-top: 1px solid var(--border); margin: 24px 0; }
    .foot { margin-top: 48px; padding-top: 16px; border-top: 1px solid var(--border); font-size: 12px; color: var(--fg-muted); text-align: center; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="crumb"><a href="{{BACK}}">🧩 Storybook</a> / {{TITLE}}</div>
    {{BODY}}
    <p class="foot">betting-system Storybook · 源文件为 docs/storybook 下的 Markdown · <a href="https://github.com/bandyg/betting-system">GitHub</a></p>
  </div>
</body>
</html>
EOF

count=0
while IFS= read -r -d '' md; do
  rel="${md#docs/storybook/}"                 # components/Avatar.md
  out="$OUT/storybook/${rel%.md}.html"        # components/Avatar.html
  mkdir -p "$(dirname "$out")"

  # 1) 剥 YAML front matter（仅 README.md 有）
  awk 'NR==1 && /^---$/ {infm=1; next} infm && /^---$/ {infm=0; next} !infm {print}' "$md" > "$PAGE_TEMPLATE.clean"
  # 2) 渲染 body（md 互链改写为 .html —— 产物里没有 .md 文件）
  npx --yes marked -i "$PAGE_TEMPLATE.clean" -o "$PAGE_TEMPLATE.body"
  sed -i 's/href="\([^"]*\)\.md"/href="\1.html"/g' "$PAGE_TEMPLATE.body"
  # 3) 标题取首个 H1（无 H1 则用文件名）
  title=$(grep -m1 '^# ' "$PAGE_TEMPLATE.clean" | sed 's/^# *//' || true)
  [ -n "$title" ] || title="$(basename "${rel%.md}")"
  # 4) back 链接：子目录页回 storybook 根
  back="../index.html"
  [ "$rel" != "${rel#*/}" ] || back="./index.html"
  case "$rel" in */*) back="../index.html" ;; *) back="./index.html" ;; esac

  # 5) 拼页壳（awk 替换占位，避免 sed 处理 HTML 转义问题）
  awk -v t="$title" -v b="$back" '
    { if (index($0,"{{BODY}}")) { while ((getline line < body) > 0) print line } else { gsub(/\{\{TITLE\}\}/, t); gsub(/\{\{BACK\}\}/, b); print } }
  ' body="$PAGE_TEMPLATE.body" "$PAGE_TEMPLATE" > "$out"

  count=$((count + 1))
done < <(find docs/storybook -name '*.md' -print0)

echo "Pages built: landing + storybook($count md→html) + $(ls "$OUT/visual-baseline" | wc -l) baselines → $OUT/"
