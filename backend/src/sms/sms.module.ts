import { Global, Module } from '@nestjs/common';
import { SmsService } from './sms.service.js';
import { StaffTextsService } from './staff-texts.service.js';

/** Text messages (Termii), for sign-in codes, delivery alerts and staff notices. */
@Global()
@Module({ providers: [SmsService, StaffTextsService], exports: [SmsService, StaffTextsService] })
export class SmsModule {}
