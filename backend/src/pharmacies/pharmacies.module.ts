import { Module } from '@nestjs/common';
import { PharmaciesController } from './pharmacies.controller.js';

@Module({ controllers: [PharmaciesController] })
export class PharmaciesModule {}
