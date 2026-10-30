import { Module } from '@nestjs/common';
import { AdminTransfersController, TransfersController } from './transfers.controller.js';
import { TransfersService } from './transfers.service.js';

@Module({ controllers: [TransfersController, AdminTransfersController], providers: [TransfersService] })
export class TransfersModule {}
