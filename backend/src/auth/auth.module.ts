import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthController, SessionController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { MfaService } from './mfa.service.js';
import { OtpService } from './otp.service.js';
import { SessionsService } from './sessions.service.js';
import { SocialVerifier } from './social-verifier.service.js';

@Module({
  controllers: [AuthController, SessionController],
  providers: [
    AuthService,
    OtpService,
    SessionsService,
    MfaService,
    { provide: SocialVerifier, inject: [ConfigService], useFactory: (config: ConfigService) => new SocialVerifier(config) },
  ],
  exports: [AuthService, SessionsService, MfaService],
})
export class AuthModule {}
