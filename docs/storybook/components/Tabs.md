# Tabs

主导航 tabs — 8 个路由。

## 路由

| Tab | Route | 权限 |
|-----|-------|------|
| 赛事 | `/matches` | 公开 |
| 下注 | `/` (default) | 公开 |
| 我的投注 | `/bets` | 登录 |
| 账户 | `/accounts` | admin |
| 赛事管理 | `/matches-admin` | admin |
| 结算 | `/settle` | admin |
| Feed | `/feed` | admin |
| 客服 | `/support` | admin |

## 实现

简单的 `NavLink` 列表 + active 状态样式

## 实际位置
`apps/web/src/components/Tabs.tsx`