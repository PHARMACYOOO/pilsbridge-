import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayUnique, IsDateString, IsEmail, IsIn, IsInt, IsOptional, IsString, Length, Matches, Max, Min } from 'class-validator';
import { AREA_KEYS } from '../delivery/areas.js';

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** What a pharmacist may change. The trading name, address and licence go through Pilbridge (they're verified). */
export class UpdateSettingsDto {
  @ApiPropertyOptional({ example: '0803 000 0100', description: 'Counter phone couriers call at pickup' }) @IsOptional() @IsString() @Length(10, 20) phone?: string;
  @ApiPropertyOptional({ example: 'orders@oakfieldpharmacy.ng' }) @IsOptional() @IsEmail() email?: string;
  @ApiPropertyOptional({ example: [1, 2, 3, 4, 5, 6], description: 'ISO weekdays open for delivery orders, 1 = Monday' })
  @IsOptional()
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(7, { each: true })
  @ArrayUnique()
  @ArrayMaxSize(7)
  openDays?: number[];
  @ApiPropertyOptional({ example: '08:00' }) @IsOptional() @Matches(HHMM, { message: 'Times look like 08:00' }) opensAt?: string;
  @ApiPropertyOptional({ example: '19:30' }) @IsOptional() @Matches(HHMM, { message: 'Times look like 19:30' }) lastOrderAt?: string;
  @ApiPropertyOptional({ enum: AREA_KEYS, isArray: true, description: 'Delivery areas served; empty = every area' })
  @IsOptional()
  @IsIn(AREA_KEYS, { each: true })
  @ArrayUnique()
  @ArrayMaxSize(AREA_KEYS.length)
  coverageAreas?: string[];
}

export class BankDetailsDto {
  @ApiProperty({ example: 'GTBank' }) @IsString() @Length(2, 60) bankName: string;
  @ApiProperty({ example: 'Oakfield Pharmacy Ltd', description: 'As registered with the bank' }) @IsString() @Length(2, 100) accountName: string;
  @ApiProperty({ example: '0123454821', description: '10-digit NUBAN' }) @Matches(/^\d{10}$/, { message: 'Enter the 10-digit account number' }) accountNumber: string;
}

export class ActivityQueryDto {
  @ApiPropertyOptional({ example: 50 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) limit?: number;
  @ApiPropertyOptional({ description: 'Entries before this time, for the next page' }) @IsOptional() @IsDateString() before?: string;
}
