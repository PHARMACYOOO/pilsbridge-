import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AccountsModule } from './accounts/accounts.module.js';
import { AdminModule } from './admin/admin.module.js';
import { AuditModule } from './audit/audit.module.js';
import { AuthModule } from './auth/auth.module.js';
import { CatalogModule } from './catalog/catalog.module.js';
import { ComplianceModule } from './compliance/compliance.module.js';
import { JwtAuthGuard, RolesGuard } from './common/guards.js';
import { phoneTracker } from './common/throttle.js';
import { validateEnv } from './config.js';
import { DeliveryModule } from './delivery/delivery.module.js';
import { HealthController } from './health/health.controller.js';
import { IncidentsModule } from './incidents/incidents.module.js';
import { InventoryModule } from './inventory/inventory.module.js';
import { OnboardingModule } from './onboarding/onboarding.module.js';
import { OrdersModule } from './orders/orders.module.js';
import { PaymentsModule } from './payments/payments.module.js';
import { PharmaciesModule } from './pharmacies/pharmacies.module.js';
import { PortalModule } from './portal/portal.module.js';
import { PrescriptionsModule } from './prescriptions/prescriptions.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { QuotesModule } from './quotes/quotes.module.js';
import { ReportsModule } from './reports/reports.module.js';
import { SettlementsModule } from './settlements/settlements.module.js';
import { SmsModule } from './sms/sms.module.js';
import { TransfersModule } from './transfers/transfers.module.js';
import { UsersModule } from './users/users.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: { expiresIn: config.get('JWT_TTL') ?? '7d', issuer: 'pilbridge-api' },
        verifyOptions: { issuer: 'pilbridge-api' },
      }),
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [
          // Per client IP, for everything.
          { name: 'default', ttl: 60_000, limit: 120 },
          // Per phone number; only tightened on the sign-in code routes (see AuthController).
          { name: 'phone', ttl: 60_000, limit: 1_000, getTracker: phoneTracker },
        ],
        // Test runs only; validateEnv refuses this in production. Per-phone OTP limits still apply.
        skipIf: () => config.get('THROTTLE_DISABLED') === 'true',
      }),
    }),
    PrismaModule,
    SmsModule,
    AuditModule,
    AuthModule,
    UsersModule,
    CatalogModule,
    PharmaciesModule,
    InventoryModule,
    OrdersModule,
    PaymentsModule,
    DeliveryModule,
    AdminModule,
    IncidentsModule,
    ReportsModule,
    PrescriptionsModule,
    QuotesModule,
    OnboardingModule,
    ComplianceModule,
    TransfersModule,
    SettlementsModule,
    PortalModule,
    AccountsModule,
  ],
  controllers: [HealthController],
  providers: [
    // Order matters: rate limit, then authenticate, then authorise.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
