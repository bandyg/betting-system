import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import db from '../db/index.js';
import { requireAuth, requireRole } from './middleware.js';
import { getProvider, listProviders } from '../payments/provider.js';
import { MockProvider } from '../payments/mock.js';

export const paymentsRouter = Router();

/** 生成内部订单号：PO + yyyymmddHHMMSS + 6位随机 */
function genOrderNo(): string {
  const d = new Date();
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  const ts = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  const rand = randomUUID().replace(/-/g, '').slice(0, 6).toUpperCase();
  return `PO${ts}${rand}`;
}

// ─────────────────────────────────────────────────────────────
// POST /payments/deposit — 创建充值订单（登录用户）
//  body: { amount, currency?, provider? }
// ─────────────────────────────────────────────────────────────
paymentsRouter.post('/payments/deposit', requireAuth, async (req, res) => {
  const user = res.locals.user;
  const { amount, currency = 'USD', provider = 'mock' } = req.body ?? {};
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) {
    return res.status(400).json({ error: 'amount 必须是正数' });
  }
  // 充值限额（防刷单）：单笔 1 ~ 100000，对齐风控上限
  if (amt < 1 || amt > 100000) {
    return res.status(400).json({ error: `amount 超出允许范围 (1 ~ 100000)` });
  }
  let prov;
  try {
    prov = getProvider(provider);
  } catch {
    return res.status(400).json({ error: `未知支付渠道: ${provider}，可用: ${listProviders().map((p) => p.name).join(', ')}` });
  }
  if (!prov.isConfigured()) {
    return res.status(400).json({ error: `支付渠道 ${provider} 未配置，暂不可用` });
  }

  const orderNo = genOrderNo();
  try {
    const created = await prov.createDepositOrder({ userId: user.id, amount: amt, currency, orderNo });
    const info = db
      .prepare(
        `INSERT INTO payment_orders (order_no, user_id, provider, amount, currency, status, provider_order_id, pay_url)
         VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)`,
      )
      .run(orderNo, user.id, provider, amt, currency, created.providerOrderId, created.payUrl);
    const row = db
      .prepare('SELECT * FROM payment_orders WHERE id = ?')
      .get(Number(info.lastInsertRowid));
    return res.status(201).json({ order: row });
  } catch (e) {
    console.error('[payments] create order failed:', e);
    return res.status(502).json({ error: `支付渠道下单失败: ${(e as Error).message}` });
  }
});

// ─────────────────────────────────────────────────────────────
// POST /payments/callback/:provider — 支付渠道异步通知（公开，验签后入账）
//  幂等：同订单重复回调只入账一次（状态 pending → paid 才加钱）
// ─────────────────────────────────────────────────────────────
paymentsRouter.post('/payments/callback/:provider', async (req, res) => {
  const providerName = req.params.provider;
  let prov;
  try {
    prov = getProvider(providerName);
  } catch {
    return res.status(404).json({ error: '未知支付渠道' });
  }
  // 1. 验签（必须先验签，防止伪造回调）
  const parsed = await prov.verifyCallback(req.body, req.headers as Record<string, string | string[] | undefined>);
  if (!parsed) {
    return res.status(401).json({ error: '回调验签失败' });
  }
  // 2. 找本地订单（provider_order_id 或 order_no 匹配）
  const order = db
    .prepare(
      `SELECT * FROM payment_orders
       WHERE provider_order_id = ? OR order_no = ?`,
    )
    .get(parsed.providerOrderId, parsed.providerOrderId) as
    | { id: number; order_no: string; user_id: number; amount: number; status: string }
    | undefined;
  if (!order) {
    return res.status(404).json({ error: '订单不存在' });
  }
  // 3. 幂等：已 paid 直接返回成功（渠道会重试回调）
  if (order.status === 'paid') {
    return res.json({ ok: true, order_no: order.order_no, status: 'paid', idempotent: true });
  }
  if (order.status === 'failed' || order.status === 'expired') {
    return res.status(409).json({ error: `订单已终态: ${order.status}` });
  }

  if (parsed.status === 'failed') {
    db.prepare(`UPDATE payment_orders SET status = 'failed' WHERE id = ?`).run(order.id);
    return res.json({ ok: true, order_no: order.order_no, status: 'failed' });
  }

  // 4. 金额对账：回调金额 < 订单金额 → 拒绝（防短付）
  if (parsed.amount < order.amount - 0.005) {
    console.warn(`[payments] amount mismatch: order=${order.order_no} expect=${order.amount} got=${parsed.amount}`);
    return res.status(409).json({ error: '支付金额与订单金额不符' });
  }

  // 5. 入账（事务：更新订单 + 账户余额 + 流水）
  const settle = db.transaction(() => {
    db.prepare(`UPDATE payment_orders SET status = 'paid', paid_at = datetime('now') WHERE id = ?`).run(order.id);
    const acc = db.prepare('SELECT id, balance FROM accounts WHERE user_id = ?').get(order.user_id) as
      | { id: number; balance: number }
      | undefined;
    if (!acc) throw new Error(`account not found for user ${order.user_id}`);
    const newBalance = acc.balance + order.amount;
    db.prepare('UPDATE accounts SET balance = ?, updated_at = datetime(\'now\') WHERE id = ?').run(newBalance, acc.id);
    db.prepare(
      `INSERT INTO transactions (account_id, type, amount, ref_type, ref_id)
       VALUES (?, 'deposit', ?, 'payment_order', ?)`,
    ).run(acc.id, order.amount, order.id);
    return newBalance;
  });
  try {
    const newBalance = settle();
    return res.json({ ok: true, order_no: order.order_no, status: 'paid', balance: newBalance });
  } catch (e) {
    console.error('[payments] settle failed:', e);
    return res.status(500).json({ error: '入账失败' });
  }
});

// ─────────────────────────────────────────────────────────────
// POST /payments/mock/pay — 模拟支付成功（仅 mock 渠道；等价于模拟用户完成支付）
//  这是「模拟收银台」动作：调用它 = 用户在模拟支付页点了「确认支付」，
//  之后由本端点内部触发带签名的回调 → 走标准回调入账链路。
// ─────────────────────────────────────────────────────────────
paymentsRouter.post('/payments/mock/pay', async (req, res) => {
  const { order_no, status = 'paid' } = req.body ?? {};
  if (typeof order_no !== 'string' || !order_no) {
    return res.status(400).json({ error: 'order_no 必填' });
  }
  const order = db.prepare('SELECT * FROM payment_orders WHERE order_no = ?').get(order_no) as
    | { id: number; order_no: string; provider: string; amount: number; currency: string; provider_order_id: string; status: string }
    | undefined;
  if (!order) {
    return res.status(404).json({ error: '订单不存在' });
  }
  if (order.provider !== 'mock') {
    return res.status(400).json({ error: '仅 mock 渠道支持模拟支付' });
  }
  // 幂等：已 paid 直接返回成功（模拟重复回调场景）
  if (order.status === 'paid') {
    return res.json({ ok: true, order_no, status: 'paid', idempotent: true });
  }
  if (order.status !== 'pending') {
    return res.status(409).json({ error: `订单当前状态: ${order.status}` });
  }
  const st = status === 'failed' ? 'failed' : 'paid';
  const mock = getProvider('mock') as MockProvider;
  const signature = mock.signCallback(order.provider_order_id, st, order.amount, order.currency);
  // 复用标准回调端点逻辑：手动构造回调请求
  const parsed = await mock.verifyCallback(
    { provider_order_id: order.provider_order_id, status: st, amount: order.amount, currency: order.currency },
    { 'x-mock-signature': signature },
  );
  if (!parsed) {
    return res.status(500).json({ error: '模拟回调签名失败' });
  }
  const orderRow = db
    .prepare('SELECT * FROM payment_orders WHERE order_no = ?')
    .get(order_no) as { id: number; order_no: string; user_id: number; amount: number; status: string };

  if (parsed.status === 'failed') {
    db.prepare(`UPDATE payment_orders SET status = 'failed' WHERE id = ?`).run(orderRow.id);
    return res.json({ ok: true, order_no, status: 'failed' });
  }
  if (orderRow.status === 'paid') {
    return res.json({ ok: true, order_no, status: 'paid', idempotent: true });
  }
  if (orderRow.status !== 'pending') {
    return res.status(409).json({ error: `订单已终态: ${orderRow.status}` });
  }
  const settle = db.transaction(() => {
    db.prepare(`UPDATE payment_orders SET status = 'paid', paid_at = datetime('now') WHERE id = ?`).run(orderRow.id);
    const acc = db.prepare('SELECT id, balance FROM accounts WHERE user_id = ?').get(orderRow.user_id) as
      | { id: number; balance: number }
      | undefined;
    if (!acc) throw new Error(`account not found for user ${orderRow.user_id}`);
    const newBalance = acc.balance + orderRow.amount;
    db.prepare('UPDATE accounts SET balance = ?, updated_at = datetime(\'now\') WHERE id = ?').run(newBalance, acc.id);
    db.prepare(
      `INSERT INTO transactions (account_id, type, amount, ref_type, ref_id)
       VALUES (?, 'deposit', ?, 'payment_order', ?)`,
    ).run(acc.id, orderRow.amount, orderRow.id);
    return newBalance;
  });
  const newBalance = settle();
  return res.json({ ok: true, order_no, status: 'paid', balance: newBalance });
});

// ─────────────────────────────────────────────────────────────
// GET /payments/orders — 我的充值订单（登录用户）；?all=1 全部（admin）
// GET /payments/orders/:orderNo — 查单（本人或 admin）
// ─────────────────────────────────────────────────────────────
paymentsRouter.get('/payments/orders', requireAuth, (req, res) => {
  const user = res.locals.user;
  const all = req.query.all === '1' || req.query.all === 'true';
  const rows = all && user.role === 'admin'
    ? db.prepare('SELECT * FROM payment_orders ORDER BY id DESC LIMIT 200').all()
    : db.prepare('SELECT * FROM payment_orders WHERE user_id = ? ORDER BY id DESC LIMIT 200').all(user.id);
  res.json({ orders: rows });
});

paymentsRouter.get('/payments/orders/:orderNo', requireAuth, (req, res) => {
  const user = res.locals.user;
  const row = db.prepare('SELECT * FROM payment_orders WHERE order_no = ?').get(req.params.orderNo) as
    | { user_id: number }
    | undefined;
  if (!row) {
    return res.status(404).json({ error: '订单不存在' });
  }
  if (row.user_id !== user.id && user.role !== 'admin') {
    return res.status(403).json({ error: '无权查看该订单' });
  }
  res.json({ order: db.prepare('SELECT * FROM payment_orders WHERE order_no = ?').get(req.params.orderNo) });
});

// ─────────────────────────────────────────────────────────────
// GET /payments/providers — 可用支付渠道（公开，供前端渲染）
// ─────────────────────────────────────────────────────────────
paymentsRouter.get('/payments/providers', (_req, res) => {
  res.json({ providers: listProviders() });
});
