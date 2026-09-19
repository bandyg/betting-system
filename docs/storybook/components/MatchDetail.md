# MatchDetail

赛事详情 modal — 点击赛事名时打开。

## Props

| Prop       | Type                  | Default | 描述 |
|------------|-----------------------|---------|------|
| `match`    | `Match \| null`        | —       | 当前赛事（null 时不显示） |
| `onClose`  | `() => void`          | —       | 关闭回调 |
| `onPick`   | `(m, mk, o) => void`  | —       | 选赔率回调（加入投注单） |
| `loggedIn` | `boolean`             | —       | 是否登录（决定加注按钮可用性） |

## 显示内容

- **Header**: 队伍名 / sport / league / kickoff / 状态 badge / 比分（如果有）
- **Market tabs**: 1x2 / 让球 / 大小 + line + closed 标记
- **Odds 表格**: 选项 / 赔率 / 隐含概率 / 加注按钮
- **MiniChart**: 每个 odds 显示 24 点历史曲线（mock data）

## 加注按钮状态

- 已登录 + market open: `＋ 加注`
- 未登录: `🔒 登录`
- market 关闭: `已关闭`

## 实际位置
`apps/web/src/components/MatchDetail.tsx` (135 行)

## Sprint
Sprint 2 A2 + Sprint 3 #A2v2 (历史曲线)