import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'node:crypto';
import type { FlutterwaveTransaction } from './charge.js';

const API = 'https://api.flutterwave.com/v3';
const TIMEOUT_MS = 15_000;

/**
 * Flutterwave (https://developer.flutterwave.com). The browser opens Flutterwave's inline checkout
 * with the public key; nothing it reports is trusted until the transaction is verified here with
 * the secret key.
 */
@Injectable()
export class FlutterwaveService {
  private readonly log = new Logger(FlutterwaveService.name);

  constructor(private readonly config: ConfigService) {}

  get publicKey() {
    return this.config.get<string>('FLW_PUBLIC_KEY') ?? '';
  }

  get configured() {
    return Boolean(this.publicKey && this.config.get<string>('FLW_SECRET_KEY'));
  }

  /** Webhooks carry the secret hash set on the Flutterwave dashboard in the `verif-hash` header. */
  webhookAuthentic(header: string | undefined) {
    const expected = this.config.get<string>('FLW_SECRET_HASH');
    if (!expected || !header) return false;
    const a = Buffer.from(header);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  async verify(transactionId: number): Promise<FlutterwaveTransaction> {
    let status = 0;
    let body: { status?: string; message?: string; data?: FlutterwaveTransaction } = {};
    try {
      const res = await fetch(`${API}/transactions/${encodeURIComponent(transactionId)}/verify`, {
        headers: { Authorization: `Bearer ${this.config.getOrThrow<string>('FLW_SECRET_KEY')}` },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      status = res.status;
      body = await res.json().catch(() => ({}));
    } catch (e) {
      this.log.error(`Flutterwave unreachable: ${e instanceof Error ? e.message : String(e)}`);
      throw new BadGatewayException('We couldn’t confirm your payment with Flutterwave — please try again in a moment');
    }
    if (status !== 200 || body.status !== 'success' || !body.data) {
      this.log.warn(`Flutterwave couldn’t verify transaction ${transactionId}: HTTP ${status} ${body.message ?? ''}`.trim());
      throw new BadGatewayException('We couldn’t confirm that payment — if you were charged, contact support with your order code');
    }
    return body.data;
  }
}
