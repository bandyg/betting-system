# Visual Regression — 视觉回归测试 (Sprint 5 + 扩展)

> Playwright + pixelmatch 截图对比，**纯 CLI / 零前端 build 依赖**

## 文件位置

```
scripts/
├── capture_baseline.mjs    # 截 baseline (大改 UI 后跑)
└── visual_regression.mjs   # 当前 vs baseline 对比

docs/
├── visual-baseline/        # baseline PNG (committed)
├── visual-current/         # 当前截图 (.gitignore)
└── visual-diff/            # diff PNG + report (.gitignore)
```

## 用法

### 1. 设置环境

```bash
# bhs-4 上 (无 MSVC, 不能本机跑)
bhs-4 $ cd ~/services/betting-system
# 启动 API + preview (与 e2e 相同)
bhs-4 $ PORT=14100 BETTING_DB_PATH=/tmp/u.db node apps/api/dist/index.js &
bhs-4 $ cd apps/web && VITE_API_TARGET=http://localhost:14100 \
  node ../../node_modules/vite/bin/vite.js preview --port 14203 &
```

### 2. 截 baseline (首次 / 大改 UI 后)

```bash
bhs-4 $ BASE=http://127.0.0.1:14203 API=http://127.0.0.1:14100/api \
  node scripts/capture_baseline.mjs
# 截图保存到 docs/visual-baseline/{login,matches,bets,accounts,...}.png
# 8 个关键页面 × 1400×900 viewport
```

**commit 这些 PNG 到 repo**, 作为后续对比基准。

### 3. 视觉回归对比 (PR 验证)

```bash
bhs-4 $ BASE=http://127.0.0.1:14203 API=http://127.0.0.1:14100/api \
  node scripts/visual_regression.mjs
# 输出:
#   ✅ login: 0 px diff
#   ✅ matches: 12 px diff
#   ❌ bets: 4321 px diff (可能 UI 改了)
#   ...
# 退出码 0 全 PASS / 1 有 FAIL
```

### 4. CI 集成 (建议)

```yaml
# .github/workflows/ci.yml
- name: Visual regression
  run: |
    BASE=http://localhost:3000 API=http://localhost:4100/api \
      node scripts/visual_regression.mjs
```

## 工具链

| 工具 | 用途 | 安装 |
|------|------|------|
| **Playwright** | 截浏览器截图 | 已在 `~/.npm/_npx/` 缓存 (e2e 共用) |
| **pixelmatch** | 像素级 diff | 全局 `pixelmatch` CLI (npx) |
| **chromium** | headless browser | Playwright 自带 |

**零 npm install** — Playwright 通过 npx 缓存, pixelmatch 直接调 CLI.

## 关键页面覆盖

| 页面 | URL | 权限 |
|------|-----|------|
| 登录 | `/login` | 公开 |
| 赛事大厅 | `/matches` | 公开 |
| 我的投注 | `/bets` | 登录 |
| 账户管理 | `/accounts` | admin |
| 赛事管理 | `/matches-admin` | admin |
| 结算 | `/settle` | admin |
| Feed | `/feed` | admin |
| 客服 | `/support` | admin |

## 阈值与容差

- **pixelmatch 阈值**: `0.1` (10% pixel mismatch per page)
- **测试容忍**:
  - 偶发动画 (loading spinner, fade-in) — `waitForTimeout(800)` 等动画完成
  - 随机数据 (赔率 update) — 测试前 seed 固定数据 (1 场未来赛事 + user balance)
  - 时间戳 — 不在截图关键区域

## 报告输出

```
============================================================
📸 Visual Regression — 8 pages
   ✅ PASS: 7
   ❌ FAIL: 1

Failed pages:
   - bets: 4321 px diff

Diff images: docs/visual-diff/
============================================================
```

每页 diff PNG 显示**红色高亮**不匹配区域, 直接肉眼可见改了哪里。

## 设计原则

1. **固定 viewport**: 1400×900 (e2e 同)
2. **waitForTimeout**: 800ms 等动画
3. **种子数据**: 跑前 seed 1 场未来赛事 + user 1000 余额
4. **8 个关键页面**: 不覆盖每个 modal (modal 单独 Playwright e2e 已覆盖)
5. **baseline committed**: PNG 在 repo, 防止丢失

## 已知限制

- **时间敏感**: 时间显示 (footer, 时区) 可能不同
- **网络延迟**: 加载 spinner 时序变化
- **chromium 版本**: 不同版本渲染可能像素差异
- **字体**: 系统字体变化 (chromium embedded fonts)

→ 对这些区域建议 `waitForTimeout` 长一点, 或局部遮罩 (代码可扩展)。

## 与其他测试关系

| 测试 | 工具 | 覆盖 | 速度 |
|------|------|------|------|
| **Unit** | node:test | 纯逻辑 | < 2s |
| **E2E** | Playwright (交互) | UI 行为 | 60s × 3 |
| **Visual** | Playwright + pixelmatch | UI 像素级 | 20s × 8 |

3 层覆盖: 单元 → 行为 → 像素。

## Sprint
Sprint 5 + 扩展 — 视觉回归

## 未来改进
- **CI 自动**: GitHub Action 跑 + 自动上传 diff PNG 到 PR comment
- **阈值细化**: 不同页面不同阈值 (admin 页更复杂可容差大)
- **Component-level**: 截单个组件 (avatar, league chip) 而非整页
- **Responsive**: 4 档断点 (1280/1100/800/600) 各截一遍