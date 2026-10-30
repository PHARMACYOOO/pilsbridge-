import { ConflictException, Injectable, Logger, NotFoundException, ServiceUnavailableException, UnprocessableEntityException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import { AuditService } from '../audit/audit.service.js';
import type { AuthUser } from '../common/auth-user.js';
import { isUniqueViolation } from '../common/codes.js';
import { isDevMode } from '../common/dev-mode.js';
import { OrderStatus, PaymentStatus, type Order } from '../generated/prisma/client.js';
import { patientOrderInclude, present } from '../orders/present.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { chargeProblem, orderCodeFromTxRef } from './charge.js';
import type { StartPaymentDto } from './dto.js';
import { FlutterwaveService } from './flutterwave.service.js';

const CLOSED: OrderStatus[] = [OrderStatus.CANCELLED, OrderStatus.REJECTED];

/**
 * Order payments through Flutterwave. An order is payable once it's ACCEPTED (straight away for
 * orders without prescription items; after a pharmacist approves the prescription otherwise), and
 * the pharmacy can't start preparing it until it's paid.
 */
@Injectable()
export class PaymentsService {
  private readonly log = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly flutterwave: FlutterwaveService,
    private readonly config: ConfigService,
  ) {}

  private get demo() {
    return !this.flutterwave.configured && isDevMode(this.config);
  }

  private async payableOrder(user: AuthUser, code: string) {
    const order = await this.prisma.order.findFirst({ where: { code, patientId: user.id } });
    if (!order) throw new NotFoundException('Order not found');
    if (order.paymentStatus !== PaymentStatus.UNPAID) throw new ConflictException('This order is already paid');
    if (order.status === OrderStatus.PHARMACIST_REVIEW) throw new ConflictException('You can pay once a pharmacist has approved your prescription');
    if (order.status !== OrderStatus.ACCEPTED) throw new ConflictException('This order can no longer be paid for');
    return order;
  }

  /** What the browser needs to open Flutterwave's checkout (or the demo payment in development). */
  async start(user: AuthUser, code: string, dto: StartPaymentDto) {
    const order = await this.payableOrder(user, code);
    const amount = order.totalKobo / 100;
    if (this.demo) return { provider: 'demo' as const, code, amount, currency: 'NGN' };
    if (!this.flutterwave.configured) throw new ServiceUnavailableException('Online payment isn’t available yet — please try again later');

    const patient = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    const email = patient.email ?? dto.email?.toLowerCase();
    if (!email) throw new UnprocessableEntityException('Add an email address for your payment receipt');
    // Keep a receipt email the account didn't have yet, unless another account already uses it.
    if (!patient.email && !(await this.prisma.user.findUnique({ where: { email }, select: { id: true } }))) {
      await this.prisma.user.update({ where: { id: user.id }, data: { email } }).catch((e: unknown) => {
        if (!isUniqueViolation(e)) throw e;
      });
    }

    return {
      provider: 'flutterwave' as const,
      code,
      publicKey: this.flutterwave.publicKey,
      txRef: `${code}-${randomBytes(4).toString('hex')}`,
      amount,
      currency: 'NGN',
      paymentOptions: 'card,banktransfer,ussd',
      customer: {
        email,
        name: [patient.firstName, patient.lastName].filter(Boolean).join(' '),
        ...(patient.phone ? { phone_number: patient.phone } : {}),
      },
    };
  }

  /** After Flutterwave's checkout reports success: verify the transaction with Flutterwave, then mark the order paid. */
  async confirm(user: AuthUser, code: string, transactionId: number) {
    const order = await this.prisma.order.findFirst({ where: { code, patientId: user.id } });
    if (!order) throw new NotFoundException('Order not found');
    if (order.paymentStatus === PaymentStatus.UNPAID) {
      if (!this.flutterwave.configured) throw new ServiceUnavailableException('Online payment isn’t available yet');
      const tx = await this.flutterwave.verify(transactionId);
      const problem = chargeProblem(tx, order);
      if (problem) {
        this.log.warn(`Payment ${transactionId} rejected for ${order.code}: ${problem}`);
        throw new UnprocessableEntityException('That payment didn’t go through for this order — you haven’t been charged for it here');
      }
      await this.markPaid(order, String(tx.id), user.id);
    }
    return this.orderView(order.id);
  }

  /** Development only, when Flutterwave isn't configured: pretend the payment succeeded. */
  async confirmDemo(user: AuthUser, code: string) {
    if (!this.demo) throw new NotFoundException();
    const order = await this.payableOrder(user, code);
    await this.markPaid(order, `demo-${randomBytes(6).toString('hex')}`, user.id);
    return this.orderView(order.id);
  }

  /**
   * Flutterwave's webhook: covers payments whose browser closed before confirming. The payload is
   * only a hint — the transaction is verified with Flutterwave before anything changes.
   */
  async webhook(hash: string | undefined, body: unknown) {
    if (!this.flutterwave.webhookAuthentic(hash)) throw new NotFoundException();
    const { event, data } = (body ?? {}) as { event?: string; data?: { id?: unknown; tx_ref?: unknown } };
    if (event !== 'charge.completed' || typeof data?.id !== 'number' || typeof data.tx_ref !== 'string') return { received: true };

    const code = orderCodeFromTxRef(data.tx_ref);
    const order = code ? await this.prisma.order.findUnique({ where: { code } }) : null;
    if (!order || order.paymentStatus !== PaymentStatus.UNPAID) return { received: true };

    const tx = await this.flutterwave.verify(data.id);
    const problem = chargeProblem(tx, order);
    if (problem) this.log.warn(`Webhook payment ${data.id} ignored for ${order.code}: ${problem}`);
    else await this.markPaid(order, String(tx.id), null);
    return { received: true };
  }

  /**
   * Idempotent. Conditional updates make this safe against a cancellation at the same moment: a
   * payment that lands on a cancelled or rejected order is recorded as a refund due.
   */
  private async markPaid(order: Pick<Order, 'id' | 'code'>, txId: string, actorId: string | null) {
    try {
      await this.prisma.$transaction(async (tx) => {
        const data = { paidAt: new Date(), paymentTxId: txId };
        let outcome: PaymentStatus = PaymentStatus.PAID;
        const paid = await tx.order.updateMany({
          where: { id: order.id, paymentStatus: PaymentStatus.UNPAID, status: { notIn: CLOSED } },
          data: { ...data, paymentStatus: PaymentStatus.PAID },
        });
        if (paid.count === 0) {
          outcome = PaymentStatus.REFUND_DUE;
          const late = await tx.order.updateMany({ where: { id: order.id, paymentStatus: PaymentStatus.UNPAID }, data: { ...data, paymentStatus: PaymentStatus.REFUND_DUE } });
          if (late.count === 0) return; // already recorded
        }
        await this.audit.record({ actorId, action: 'order.paid', entityType: 'Order', entityId: order.id, metadata: { txId, outcome } }, tx);
      });
    } catch (e) {
      if (isUniqueViolation(e)) throw new ConflictException('This payment has already been used for another order');
      throw e;
    }
  }

  private async orderView(id: string) {
    return present(await this.prisma.order.findUniqueOrThrow({ where: { id }, include: patientOrderInclude }));
  }
}
