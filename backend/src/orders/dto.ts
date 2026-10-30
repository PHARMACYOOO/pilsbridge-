import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsEnum, IsIn, IsInt, IsLatitude, IsLongitude, IsOptional, IsString, Length, Max, Min, ValidateIf, ValidateNested } from 'class-validator';
import { AREA_KEYS } from '../delivery/areas.js';
import { OrderStatus } from '../generated/prisma/client.js';

export class OrderItemDto {
  @ApiProperty() @IsString() productId: string;
  @ApiProperty({ example: 1, description: 'Packs' }) @IsInt() @Min(1) @Max(20) quantity: number;
}

export class CreateOrderDto {
  @ApiProperty() @IsString() pharmacyId: string;

  @ApiProperty({ type: [OrderItemDto] })
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  items: OrderItemDto[];

  @ApiProperty({ example: '14 Herbert Macaulay Way, Yaba' }) @IsString() @Length(5, 200) deliveryAddress: string;

  @ApiProperty({ enum: AREA_KEYS, example: 'yaba', description: 'From GET /delivery/areas' })
  @IsIn(AREA_KEYS, { message: 'Choose your delivery area' })
  deliveryArea: string;

  // The exact drop-off the customer pinned. Needed for courier bookings and live delivery quotes.
  @ApiPropertyOptional({ example: 6.6018 })
  @ValidateIf((o: CreateOrderDto) => o.dropoffLng !== undefined || o.deliveryQuoteId !== undefined)
  @IsLatitude()
  @Min(6.3)
  @Max(6.8)
  dropoffLat?: number;

  @ApiPropertyOptional({ example: 3.3515 })
  @ValidateIf((o: CreateOrderDto) => o.dropoffLat !== undefined || o.deliveryQuoteId !== undefined)
  @IsLongitude()
  @Min(2.7)
  @Max(4.4)
  dropoffLng?: number;

  @ApiPropertyOptional({ description: 'From POST /delivery/quote: charge that delivery price' })
  @IsOptional()
  @IsString()
  deliveryQuoteId?: string;

  @ApiPropertyOptional({ description: 'Required when any item is prescription-only' })
  @IsOptional()
  @IsString()
  prescriptionId?: string;
}

export class UpdateOrderStatusDto {
  @ApiProperty({ enum: OrderStatus }) @IsEnum(OrderStatus) status: OrderStatus;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(2, 300) note?: string;
}
