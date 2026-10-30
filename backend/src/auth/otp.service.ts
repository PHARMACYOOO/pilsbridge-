import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service.js';

export const OTP_TTL_SECONDS = 300;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_MAX_PER_HOUR = 5;

/** Issues and checks 6-digit codes. Only an HMAC of each code is stored. */
@Injectable()
export class OtpService {
  private readonly key: Buffer;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.key = createHmac('sha256', config.getOrThrow<string>('JWT_SECRET')).update('otp-v1').digest();
  }

  private hash(phone: string, code: string) {
    return createHmac('sha256', this.key).update(`${phone}:${code}`).digest('hex');
  }

  async issue(phone: string): Promise<string> {
    const since = new Date(Date.now() - 60 * 60 * 1000);
    const recent = await this.prisma.otpChallenge.count({ where: { phone, createdAt: { gte: since } } });
    if (recent >= OTP_MAX_PER_HOUR) {
      throw new HttpException('Too many codes requested — try again in an hour', HttpStatus.TOO_MANY_REQUESTS);
    }

    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    await this.prisma.$transaction([
      // Only the newest code is valid.
      this.prisma.otpChallenge.updateMany({ where: { phone, consumedAt: null }, data: { consumedAt: new Date() } }),
      this.prisma.otpChallenge.create({
        data: { phone, codeHash: this.hash(phone, code), expiresAt: new Date(Date.now() + OTP_TTL_SECONDS * 1000) },
      }),
    ]);
    return code;
  }

  /** Returns true when the code matches; consumes the challenge on success. */
  async check(phone: string, code: string): Promise<boolean> {
    const challenge = await this.prisma.otpChallenge.findFirst({
      where: { phone, consumedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    if (!challenge) throw new HttpException('That code has expired — request a new one', HttpStatus.BAD_REQUEST);
    if (challenge.attempts >= OTP_MAX_ATTEMPTS) {
      throw new HttpException('Too many incorrect attempts — request a new code', HttpStatus.TOO_MANY_REQUESTS);
    }

    const expected = Buffer.from(challenge.codeHash, 'hex');
    const actual = Buffer.from(this.hash(phone, code), 'hex');
    const ok = expected.length === actual.length && timingSafeEqual(expected, actual);

    // Conditional update so two parallel correct submissions can't both succeed.
    const updated = await this.prisma.otpChallenge.updateMany({
      where: { id: challenge.id, consumedAt: null },
      data: ok ? { consumedAt: new Date() } : { attempts: { increment: 1 } },
    });
    return ok && updated.count === 1;
  }
}
