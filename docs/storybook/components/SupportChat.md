# SupportChat

客服聊天 widget — 浮动 💬 按钮 + FAQ bot 回复。

## 功能

- **浮动按钮**: 右下角圆形 (52px)，点击切换打开
- **未读 badge**: agent 消息自动计数
- **chat panel**: 360×540 居右下
- **FAQ bot**: 12 个常见问题关键词匹配
- **6 个快捷回复**: 一键填到输入框
- **localStorage 持久化**: 最近 50 条历史
- **键盘**: Enter 发送 / Shift+Enter 换行 / ESC 关闭
- **清空聊天**: 🗑 + confirm
- **响应式**: 移动端 fab 缩小 + panel 全宽

## FAQ 数据库

| 关键词 | 回复 |
|--------|------|
| 下注/怎么下/如何下/投注 | 下注流程 4 步 |
| 结算/怎么算/派彩/输赢 | 命中派彩 = 投注额 × 赔率 |
| 登录/注册/账号/忘记 | demo: admin/admin123 |
| 余额/充值/提现/钱 | 演示系统手动调整 |
| 联赛/数据/赔率 | feed 实时拉取 |
| 组合/parlay/多注 | 单一金额应用所有选，赔率相乘 |
| pwa/离线/缓存 | 断网刷新看 banner |
| i18n/语言/英文/切换 | header 中/EN 按钮 |
| 快捷键/键盘/快捷 | ? 打开帮助 |
| bug/问题/错误/出错 | console + __getErrors |
| admin/代客/管理员 | 五个管理页 |
| 缓存/data | odds-flash / saved presets |

## 实际位置
`apps/web/src/components/SupportChat.tsx` (223 行)

## Sprint
Sprint 5 C4