import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isDevMode } from '../common/dev-mode.js';
import { OTP_TTL_SECONDS } from '../auth/otp.service.js';

const SEND_TIMEOUT_MS = 10_000;

/**
 * Sends text messages through Termii (https://developers.termii.com/messaging-api): sign-in codes
 * and delivery alerts. In development (OTP_DEV_ECHO=true) they're logged instead of sent.
 *
 *
 * Codes go over the "dnd" channel by default: Termii's "generic" route doesn't reach numbers on
 * Do-Not-Disturb and isn't delivered to MTN numbers overnight. The DND route must be activated on
 * the Termii account (ask Termii support) and the sender ID must be registered with Termii.
 */
@Injectable()
export class SmsService {
  private readonly log = new Logger(SmsService.name);

  constructor(private readonly config: ConfigService) {}

  get devEcho() {
    return isDevMode(this.config);
  }

  async sendOtp(phone: string, code: string): Promise<void> {
    if (this.devEcho) {
      this.log.log(`OTP for ${phone.slice(0, 7)}•••${phone.slice(-2)}: ${code}`);
      return;
    }
    const minutes = Math.round(OTP_TTL_SECONDS / 60);
    await this.send(phone, `Your Pilbridge code is ${code}. It expires in ${minutes} minutes. Never share it with anyone.`, 'We couldn’t send the code right now — please try again shortly');
  }

  /** A plain notification (no secrets in it). Keep to one SMS: 160 plain characters, no curly quotes or symbols. */
  async sendText(phone: string, text: string): Promise<void> {
    if (this.devEcho) {
      this.log.log(`SMS to ${phone.slice(0, 7)}•••${phone.slice(-2)}: ${text}`);
      return;
    }
    await this.send(phone, text, 'We couldn’t send the text message right now');
  }

  private async send(phone: string, sms: string, failure: string) {
    const apiKey = this.config.get<string>('TERMII_API_KEY');
    if (!apiKey) throw new ServiceUnavailableException('SMS delivery is not configured');
    const baseUrl = (this.config.get<string>('TERMII_BASE_URL') || 'https://api.ng.termii.com').replace(/\/$/, '');

    let status = 0;
    let body: { code?: string; message?: string; message_id?: string } = {};
    try {
      const res = await fetch(`${baseUrl}/api/sms/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: apiKey,
          to: phone.replace(/^\+/, ''), // Termii wants 234XXXXXXXXXX
          from: this.config.get<string>('TERMII_SENDER_ID') || 'Pilbridge',
          sms,
          type: 'plain',
          channel: this.config.get<string>('TERMII_CHANNEL') || 'dnd',
        }),
        signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
      });
      status = res.status;
      body = await res.json().catch(() => ({}));
    } catch (e) {
      this.log.error(`Termii unreachable: ${e instanceof Error ? e.message : String(e)}`);
      throw new ServiceUnavailableException(failure);
    }

    if (status < 200 || status >= 300 || body.code !== 'ok') {
      // Never log the message itself: it may contain a code.
      this.log.error(`Termii rejected SMS to ${phone.slice(0, 7)}•••${phone.slice(-2)}: HTTP ${status} ${body.code ?? ''} ${body.message ?? ''}`.trim());
      throw new ServiceUnavailableException(failure);
    }
    this.log.log(`SMS sent to ${phone.slice(0, 7)}•••${phone.slice(-2)} (${body.message_id ?? 'no id'})`);
  }
}
