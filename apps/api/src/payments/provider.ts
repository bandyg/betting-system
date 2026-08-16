/**
 * 支付通道抽象层（PAM 支付通道模块）
 *
 * 设计目标：供应商可插拔 —— 新增支付渠道 = 实现 PaymentProvider 接口 + 注册。
 * 当前实现：
 *  - mock       模拟沙箱（本地模拟回调，跑通全链路，无需任何资质）
 *  - nowpayments 加密通道（NOWPayments，USDT/BTC 收款；配置 NOWPAYMENTS_API_KEY 后启用）
 */

export type PaymentProviderName = 'mock' | 'nowpayments';

export type PaymentOrderStatus = 'pending' | 'paid' | 'failed' | 'expired';

/** 创建充值订单的请求 */
export interface CreateDepositRequest {
  userId: number;
  amount: number;
  currency: string;
  /** 内部订单号（生成后传入，供应商侧展示/关联用） */
  orderNo: string;
}

/** 创建订单的结果 */
export interface CreateDepositResult {
  /** 供应商侧订单号（可用于查单/对账） */
  providerOrderId: string;
  /** 用户跳转支付的 URL（Mock 为本地模拟页） */
  payUrl: string;
}

/** 供应商回调解析结果（验签通过后才有意义） */
export interface CallbackResult {
  /** 供应商侧订单号 */
  providerOrderId: string;
  /** 回调状态：paid=支付成功 failed=支付失败 */
  status: 'paid' | 'failed';
  /** 支付金额（用于对账，与订单金额不一致时应告警/拒绝） */
  amount: number;
  currency: string;
}

export interface PaymentProvider {
  readonly name: PaymentProviderName;
  /** 是否已配置（如未配 API key 则不注册/下单报错） */
  isConfigured(): boolean;
  /** 创建充值订单 */
  createDepositOrder(req: CreateDepositRequest): Promise<CreateDepositResult>;
  /**
   * 校验回调签名。签名合法返回解析后的结果；非法返回 null。
   * 注意：必须先验签再处理业务，防止伪造回调入账。
   */
  verifyCallback(body: unknown, headers: Record<string, string | string[] | undefined>): Promise<CallbackResult | null>;
}

// ─────────────────────────────────────────────────────────────
// Provider 注册表
// ─────────────────────────────────────────────────────────────

import { MockProvider } from './mock.js';
import { NowPaymentsProvider } from './nowpayments.js';

const registry = new Map<PaymentProviderName, PaymentProvider>();

export function registerProvider(p: PaymentProvider): void {
  registry.set(p.name, p);
}

export function getProvider(name: string): PaymentProvider {
  const p = registry.get(name as PaymentProviderName);
  if (!p) throw new Error(`未知支付渠道: ${name}`);
  return p;
}

export function listProviders(): { name: string; configured: boolean }[] {
  return [...registry.values()].map((p) => ({ name: p.name, configured: p.isConfigured() }));
}

// 注册内置 provider（幂等）
registerProvider(new MockProvider());
registerProvider(new NowPaymentsProvider());
