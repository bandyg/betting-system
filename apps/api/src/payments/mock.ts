import { createHmac, timingSafeEqual } from 'node:crypto';
import type {
  CallbackResult,
  CreateDepositRequest,
  CreateDepositResult,
  PaymentProvider,
} from './provider.js';

/**
 * 模拟支付沙箱（MockProvider）
 *
 * 用于在无商户资质/无公网回调的条件下跑通完整支付流程：
 * 下单 → 跳转模拟支付页 → 模拟支付成功 → 回调（带 HMAC 签名）→ 验签 → 入账。
 *
 * 真实供应商接入后，MockProvider 依然可用于测试环境。
 */
export class MockProvider implements PaymentProvider {
  readonly name = 'mock' as const;

  /** 模拟验签密钥（生产环境应从 env 读取） */
  private get secret(): string {
    return process.env.MOCK_PAYMENT_SECRET ?? 'mock-payment-secret-demo';
  }

  isConfigured(): boolean {
    return true; // 沙箱永远可用
  }

  async createDepositOrder(req: CreateDepositRequest): Promise<CreateDepositResult> {
    const providerOrderId = `MOCK-${req.orderNo}`;
    // 模拟支付页：带 order_no + 签名，前端/测试可直接 POST 完成模拟支付
    const payUrl = `http://localhost:4100/api/payments/mock/pay?order_no=${encodeURIComponent(req.orderNo)}`;
    return { providerOrderId, payUrl };
  }

  /**
   * 模拟回调验签。
   * Mock 回调请求体：{ provider_order_id, status, amount, currency }
   * 签名：X-Mock-Signature = HMAC-SHA256(secret, canonicalString)
   *   canonicalString = `${provider_order_id}|${status}|${amount}|${currency}`
   */
  async verifyCallback(
    body: unknown,
    headers: Record<string, string | string[] | undefined>,
  ): Promise<CallbackResult | null> {
    const b = body as Record<string, unknown> | null | undefined;
    if (!b || typeof b !== 'object') return null;
    const providerOrderId = typeof b.provider_order_id === 'string' ? b.provider_order_id : '';
    const status = b.status;
    const amount = Number(b.amount);
    const currency = typeof b.currency === 'string' ? b.currency : 'USD';
    if (!providerOrderId || (status !== 'paid' && status !== 'failed') || !Number.isFinite(amount)) {
      return null;
    }
    const sigHeader = headers['x-mock-signature'];
    const signature = Array.isArray(sigHeader) ? sigHeader[0] : sigHeader;
    if (!signature) return null;
    const canonical = `${providerOrderId}|${status}|${amount}|${currency}`;
    const expected = createHmac('sha256', this.secret).update(canonical).digest('hex');
    const a = Buffer.from(signature);
    const b2 = Buffer.from(expected);
    if (a.length !== b2.length || !timingSafeEqual(a, b2)) return null;
    return { providerOrderId, status, amount, currency };
  }

  /** 生成模拟回调签名（供模拟支付页/测试脚本使用） */
  signCallback(providerOrderId: string, status: 'paid' | 'failed', amount: number, currency: string): string {
    const canonical = `${providerOrderId}|${status}|${amount}|${currency}`;
    return createHmac('sha256', this.secret).update(canonical).digest('hex');
  }
}
