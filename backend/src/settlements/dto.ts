import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Length, Matches } from 'class-validator';

export class CreatePayoutsDto {
  @ApiPropertyOptional({ example: '2026-10-19', description: 'Settle deliveries made before this Lagos day (default: today)' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Dates look like 2026-10-19' })
  before?: string;
}

export class MarkPaidDto {
  @ApiProperty({ example: 'GTB-TRF-0098812', description: 'Bank transfer reference' }) @IsString() @Length(3, 80) reference: string;
}

export class VoidPayoutDto {
  @ApiProperty({ example: 'Created before a disputed order was resolved' }) @IsString() @Length(5, 300) reason: string;
}
