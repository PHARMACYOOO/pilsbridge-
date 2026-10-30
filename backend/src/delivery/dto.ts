import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsIn, IsInt, IsLatitude, IsLongitude, IsOptional, IsString, IsUrl, Length, Matches, Max, Min, ValidateIf } from 'class-validator';
import { FailureCause } from '../generated/prisma/client.js';
import { AREA_KEYS } from './areas.js';

export class RiderStatusDto {
  @ApiProperty() @IsBoolean() online: boolean;

  @ApiPropertyOptional({ enum: AREA_KEYS, description: 'Where the rider is, when going online' })
  @ValidateIf((o: RiderStatusDto) => o.online)
  @IsIn(AREA_KEYS, { message: 'Choose the area you’re in' })
  area?: string;
}

export class DropoffDto {
  @ApiProperty({ example: '4821', description: 'The 4-digit code the recipient reads out' })
  @Matches(/^\d{4}$/, { message: 'Enter the 4-digit code from the customer' })
  code: string;
}

export class FailDto {
  @ApiProperty({ example: 'Customer not reachable after 3 calls' })
  @IsString()
  @Length(3, 200)
  reason: string;

  @ApiPropertyOptional({ enum: FailureCause, description: 'Decides who bears the cost; inferred from the reason if left out' })
  @IsOptional()
  @IsEnum(FailureCause)
  cause?: FailureCause;
}


export class HandoverDto {
  @ApiProperty({ example: 'DL-9F2C41AA', description: 'The seal code the rider or courier shows; must match the parcel' })
  @IsString()
  @Length(4, 20)
  sealCode: string;
}

export class BookCourierDto {
  @ApiProperty() @IsString() courierId: string;

  @ApiProperty({ example: 'RLY-88213', description: 'The courier’s own booking reference' })
  @IsString()
  @Length(2, 80)
  providerRef: string;

  @ApiPropertyOptional({ example: 250000, description: 'What the courier charges us, in kobo' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10_000_000)
  feeKobo?: number;

  @ApiPropertyOptional({ example: 'https://track.example.com/RLY-88213' })
  @IsOptional()
  @IsUrl({ require_protocol: true })
  trackingUrl?: string;
}

export class CourierDeliveredDto {
  @ApiPropertyOptional({ example: '4821', description: 'The customer’s 4-digit code, read back by the courier' })
  @IsOptional()
  @Matches(/^\d{4}$/, { message: 'The customer’s code is 4 digits' })
  customerCode?: string;

  @ApiPropertyOptional({ example: 'Relay POD PIN confirmed 14:32', description: 'The courier’s proof-of-delivery reference, when there’s no customer code' })
  @IsOptional()
  @IsString()
  @Length(3, 120)
  courierProof?: string;
}

export class CheckoutQuoteDto {
  @ApiProperty() @IsString() pharmacyId: string;
  @ApiProperty({ example: 6.6018 }) @IsLatitude() @Min(6.3) @Max(6.8) lat: number;
  @ApiProperty({ example: 3.3515 }) @IsLongitude() @Min(2.7) @Max(4.4) lng: number;
  @ApiPropertyOptional({ description: 'Basket has prescription-only items' }) @IsOptional() @IsBoolean() prescription?: boolean;
  @ApiPropertyOptional({ description: 'Basket has 2–8 °C items' }) @IsOptional() @IsBoolean() coldChain?: boolean;
  @ApiPropertyOptional({ example: '5 Allen Avenue, Ikeja' }) @IsOptional() @IsString() @Length(3, 200) address?: string;
}
