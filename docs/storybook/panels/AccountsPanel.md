# AccountsPanel

账户管理 (admin only) — 创建用户 + 充值/扣款。

## 功能

- 用户列表 + balance
- 创建用户
- 充值 (deposit)
- 扣款 (withdraw)
- 余额即时刷新

## 实际位置
`apps/web/src/panels/AccountsPanel.tsx`

## API
- `POST /users`
- `POST /users/:id/deposit`
- `POST /users/:id/withdraw`
- `GET /users`