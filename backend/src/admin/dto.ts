import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsInt, IsLatitude, IsLongitude, IsOptional, IsString, Length, Max, Min, ValidateIf } from 'class-validator';

export class CreateRiderDto {
  @ApiProperty({ example: 'Bisi' }) @IsString() @Length(1, 60) firstName: string;
  @ApiProperty({ example: 'Kalu' }) @IsString() @Length(1, 60) lastName: string;
  @ApiProperty({ example: '0803 123 4567' }) @IsString() @Length(10, 20) phone: string;
  @ApiProperty({ example: 'Swift Courier', description: 'Logistics company the rider works for' }) @IsString() @Length(2, 80) partner: string;
  @ApiPropertyOptional({ description: 'Carries a validated cold box' }) @IsOptional() @IsBoolean() coldChain?: boolean;
}

export class UpdateRiderDto {
  @ApiPropertyOptional({ description: 'Paused riders can’t go online or take jobs' }) @IsOptional() @IsBoolean() active?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() coldChain?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(2, 80) partner?: string;
}

export const COURIER_APIS = ['CHOWDECK_RELAY'];

/** Roughly Lagos State, so a typo can't put a pharmacy in another country. */
export class PharmacyLocationDto {
  @ApiProperty({ example: 6.5095 }) @IsLatitude() @Min(6.3) @Max(6.8) lat: number;
  @ApiProperty({ example: 3.3711 }) @IsLongitude() @Min(2.7) @Max(4.4) lng: number;
}

export class CourierDto {
  @ApiProperty({ example: 'Chowdeck Relay' }) @IsString() @Length(2, 80) name: string;
  @ApiPropertyOptional({ example: 'dispatch@example.com / 0803 000 0000' }) @IsOptional() @IsString() @Length(2, 120) contact?: string;
  @ApiPropertyOptional({ description: 'Has accepted prescription-only parcels in writing' }) @IsOptional() @IsBoolean() acceptsPrescription?: boolean;
  @ApiPropertyOptional({ description: 'Has shown validated 2–8 °C capability' }) @IsOptional() @IsBoolean() acceptsColdChain?: boolean;
  @ApiPropertyOptional({ example: 'Written acceptance: email from Relay ops, 12 Oct 2026' }) @IsOptional() @IsString() @Length(2, 300) approvalNote?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() active?: boolean;
  @ApiPropertyOptional({ enum: COURIER_APIS, nullable: true, description: 'Connected API; null = booked by hand on their dashboard' })
  @ValidateIf((o: { api?: string | null }) => o.api !== null && o.api !== undefined)
  @IsIn(COURIER_APIS)
  api?: string | null;
  @ApiPropertyOptional({ description: 'Lower is tried first' }) @IsOptional() @IsInt() @Min(1) @Max(1000) priority?: number;
}

export class UpdateCourierDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(2, 120) contact?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() acceptsPrescription?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() acceptsColdChain?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(2, 300) approvalNote?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() active?: boolean;
  @ApiPropertyOptional({ enum: COURIER_APIS, nullable: true, description: 'Connected API; null = booked by hand on their dashboard' })
  @ValidateIf((o: { api?: string | null }) => o.api !== null && o.api !== undefined)
  @IsIn(COURIER_APIS)
  api?: string | null;
  @ApiPropertyOptional({ description: 'Lower is tried first' }) @IsOptional() @IsInt() @Min(1) @Max(1000) priority?: number;
}

export class ProductEligibilityDto {
  @ApiProperty({ description: 'false: pharmacy pickup only — never delivered' }) @IsBoolean() deliveryAllowed: boolean;
}

export class PharmacyPhoneDto {
  @ApiProperty({ example: '0803 000 0100', description: 'Counter phone couriers call at pickup' }) @IsString() @Length(10, 20) phone: string;
}
