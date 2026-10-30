import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { AdminOnboardingController, PartnersController } from './onboarding.controller.js';
import { OnboardingService } from './onboarding.service.js';

@Module({ imports: [AuthModule], controllers: [AdminOnboardingController, PartnersController], providers: [OnboardingService] })
export class OnboardingModule {}
