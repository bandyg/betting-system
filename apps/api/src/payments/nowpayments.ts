import { createHmac, timingSafeEqual } from 'node:crypto';
import type {
  CallbackResult,
  CreateDepositRequest,
  CreateDepositResult,
  PaymentProvider,
} from './provider.js';

/**
 * 加密支付通道（NOWPayments）—— 真实 USDT/BTC 收款
 *
 * 配置（env）：
 *   NOWPAYMENTS_API_KEY    商户 API key（必填才启用）
 *   NOWPAYMENTS_IPN_SECRET 回调签名密钥（IPN secret）
 *   NOWPAYMENTS_CURRENCY   收款币种，默认 usdttrc20
 *   NOWPAYMENTS_PRICE_CURRENCY 计价币种，默认 usd
 *
 * 流程：create payment → 用户跳转 pay_url → NOWPayments 异步通知（IPN）
 *       → verifyCallback 用 HMAC-SHA512 验签 → 入账。
 *
 * 文档：https://documenter.getpostman.com/view/7908511/S1VTVv3k
 */
export class NowPaymentsProvider implements PaymentProvider {
  readonly name = 'nowpayments' as const;

  private get apiKey(): string {
    return process.env.NOWPAYMENTS_API_KEY ?? '';
  }

  private get ipnSecret(): string {
    return process.env.NOWPAYMENTS_IPN_SECRET ?? '';
  }

  private get currency(): string {
    return process.env.NOWPAYMENTS_CURRENCY ?? 'usdttrc20';
  }

  private get priceCurrency(): string {
    return process.env.NOWPAYMENTS_PRICE_CURRENCY ?? 'usd';
  }

  private get apiBase(): string {
    return process.env.NOWPAYMENTS_API_BASE ?? 'https://api.nowpayments.io/v1';
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  async createDepositOrder(req: CreateDepositRequest): Promise<CreateDepositResult> {
    if (!this.isConfigured()) {
      throw new Error('NOWPayments 未配置：缺少 NOWPAYMENTS_API_KEY');
    }
    // 创建支付单
    // POST {apiBase}/payment
    // { price_amount, price_currency, pay_currency, order_id, ipn_callback_url, ... }
    // 响应：{ payment_id, pay_address, pay_url, ... }
    const resp = await fetch(`${this.apiBase}/payment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
      },
      body: JSON.stringify({
        price_amount: req.amount,
        price_currency: this.priceCurrency,
        pay_currency: this.currency,
        order_id: req.orderNo,
        order_description: `Deposit ${req.amount} ${this.priceCurrency.toUpperCase()} (betting-system)`,
        // IPN 回调：需要公网可达；生产环境配置 Cloudflare Tunnel / 公网域名
        ipn_callback_url: process.env.NOWPAYMENTS_IPN_CALLBACK_URL ?? '',
      }),
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new Error(`NOWPayments create payment failed: ${resp.status} ${text.slice(0, 200)}`);
    }
    const data = (await resp.json()) as { payment_id?: number | string; pay_url?: string };
    return {
      providerOrderId: String(data.payment_id ?? ''),
      payUrl: data.pay_url ?? '',
    };
  }

  /**
   * NOWPayments IPN 回调验签。
   * 签名算法：HMAC-SHA512(ipn_secret, JSON.stringify(body))，头 x-nowpayments-sig。
   * 文档：https://documenter.getpostman.com/view/7908511/S1VTVv3k#b1b8f4e5-0c4e-4f0e-8f3a-9f1c1b0e0d0e
   */
  async verifyCallback(
    body: unknown,
    headers: Record<string, string | string[] | undefined>,
  ): Promise<CallbackResult | null> {
    if (!this.ipnSecret) return null;
    const sigHeader = headers['x-nowpayments-sig'];
    const signature = Array.isArray(sigHeader) ? sigHeader[0] : sigHeader;
    if (!signature) return null;

    // 签名内容 = 原始请求体的 JSON 字符串（严格序列化）
    const raw = typeof body === 'string' ? body : JSON.stringify(body);
    const expected = createHmac('sha512', this.ipnSecret).update(raw).digest('hex');
    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

    const b2 = (typeof body === 'string' ? JSON.parse(body) : body) as Record<string, unknown>;
    const status = b2.payment_status;
    // NOWPayments 状态机：waiting/confirming/confirmed/sending/partially_paid/finished/failed/refunded/expired
    const ok = status === 'finished' || status === 'confirmed' || status === 'sending';
    const fail = status === 'failed' || status === 'expired' || status === 'refunded';
    if (!ok && !fail) return null;
    return {
      providerOrderId: String(b2.payment_id ?? ''),
      status: ok ? 'paid' : 'failed',
      amount: Number(b2.actually_paid ?? b2.price_amount ?? 0),
      currency: String(b2.pay_currency ?? this.currency),
    };
  }
}
