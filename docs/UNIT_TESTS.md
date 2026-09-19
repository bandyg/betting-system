# Unit Tests — 单元测试 (Sprint 5 C7)

> 用 Node 24 内置 `node:test` + `node:assert` 写的纯源码级单元测试。
> **零依赖**, **零网络**, **< 2 秒** 跑完全部。

## 文件位置

```
scripts/
├── test_tokens.mjs           # Design Tokens 完整性
├── test_i18n.mjs              # i18n 字典完整性
├── test_support_chat.mjs     # SupportChat FAQ bot
├── test_match_detail.mjs      # MatchDetail mock odds + 逻辑
├── test_components.mjs        # 17 组件关键源码断言
└── run_unit_tests.mjs         # 测试 runner
```

## 用法

```bash
# 跑所有 unit test
pnpm test:unit

# 跑单个测试
node --test scripts/test_tokens.mjs

# 跑单个 test case
node --test --test-name-pattern="tokens.ts"
```

## 测试覆盖

| 测试文件 | 测什么 | test case 数 |
|---------|--------|------|
| `test_tokens.mjs` | CSS/TS 镜像, 9 大类 token, dark/light 双主题, a11y | 11 |
| `test_i18n.mjs` | zh-CN/en 字典完整性, 必需 key, 类型定义 | 5 |
| `test_support_chat.mjs` | FAQ 提取 + 关键词匹配 + 6 快捷回复 + localStorage | 11 |
| `test_match_detail.mjs` | mockOddsHistory 算法, impliedProb 除零, 加注按钮逻辑 | 9 |
| `test_components.mjs` | Avatar / LeagueChip / MiniChart / ConfirmBet / ErrorReporter / OfflineBanner / BetSlip / BetsPanel / MatchesExplorer / main.tsx / PWA / Storybook | 50+ |

**总计**: 80+ test cases, 跑全 ~1.5s

## 设计原则

1. **零依赖**: 只用 Node 24 内置 (无 vitest/jest), 避免 `pnpm install` 风险
2. **源码断言**: 用 `readFileSync` + `assert.match` 验证关键字符串/函数存在
3. **可重读**: 测试可作为活文档 (看测试就知道每个组件做什么)
4. **快**: 每个 test 文件 < 500ms, 总 < 2s
5. **零 mock**: 纯函数直接测试 (如 FAQ 提取 + 关键词匹配)
6. **集成 source test**: 直接读 .tsx/.ts 源码提取/验证 (回归测试)
7. **CI-friendly**: `process.exit(1)` on failure

## 测试类型

### 1. 纯函数测试 (test_support_chat.mjs)
提取 FAQ 数组 + 复制 detectReply 函数 → 跑关键词匹配

### 2. 源码字符串断言 (test_components.mjs)
验证关键 API/字符串存在 (如 `<MatchDetail`, `<LeagueChip`, `<ConfirmBet`)
- 防回归: 删除/重命名关键代码会立即 fail
- 防误删: 必需集成点都列出

### 3. 静态分析 (test_tokens.mjs, test_i18n.mjs)
正则提取 CSS 变量 / TS 字典 / block
- 验证完整性 (token 9 类都有)
- 验证一致性 (dark/light 不同)

### 4. 行为模拟 (test_support_chat.mjs FAQ 匹配)
复制源函数逻辑 + 模拟用户输入 → 验证回复

## 不测什么

| 不测 | 原因 |
|------|------|
| React 组件渲染 | 需要 jsdom + react-testing-library + pnpm install (无 MSVC) |
| API 集成 | 后端 e2e 已覆盖 (verify_*.py/mjs) |
| CSS 视觉效果 | Playwright e2e 已覆盖 (verify_k_ux.mjs 等) |
| 异步 hook | 需要 jsdom + testing-library |

## 与 e2e 测试的关系

| 类型 | 工具 | 覆盖 | 速度 |
|------|------|------|------|
| **Unit** (本) | node:test | 纯逻辑 + 源码断言 | < 2s |
| **E2E** (Playwright) | verify_k/l/m_ux.mjs | UI 渲染 + 真实浏览器 | 60s each |
| **Backend E2E** | verify_*.py | API 业务流程 | 30s each |

3 层覆盖: 单元 → 集成 → UI, 互补。

## 后续扩展

- C7 后续可加: snapshot 测试 (组件渲染快照)
- C7 后续可加: visual regression (Playwright + pixelmatch)
- 接入 CI: 在 `.github/workflows/ci.yml` 加 `pnpm test:unit` step

## Sprint
Sprint 5 C7 — 单元测试 + 视觉回归

## 跑测试结果 (本机 Node 24)
```
🧪 Unit Tests — 5 个测试文件

══════════════════════════════════════════════════════════════
  test_components.mjs                    ✅ PASS  (50 tests)
  test_i18n.mjs                          ✅ PASS  (5 tests)
  test_match_detail.mjs                  ✅ PASS  (9 tests)
  test_support_chat.mjs                  ✅ PASS  (11 tests)
  test_tokens.mjs                        ✅ PASS  (11 tests)
══════════════════════════════════════════════════════════════

📊 Total: 5 files · 86 pass · 0 fail
```