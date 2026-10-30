import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Equals, IsDateString, IsInt, IsOptional, IsString, Length, Max, Min, NotEquals } from 'class-validator';

export class ReceiveBatchDto {
  @ApiProperty() @IsString() productId: string;
  @ApiProperty({ example: 'AMX-2309-114' }) @IsString() @Length(2, 40) batchNumber: string;
  @ApiProperty({ example: '2027-03-31' }) @IsDateString() expiresAt: string;
  @ApiProperty({ description: 'Packs received' }) @IsInt() @Min(1) @Max(100_000) quantity: number;
  @ApiProperty({ description: 'Selling price per pack, in kobo' }) @IsInt() @Min(1) priceKobo: number;
  @ApiPropertyOptional({ example: 'Shelf B3' }) @IsOptional() @IsString() @Length(1, 40) location?: string;
}

export class AdjustBatchDto {
  @ApiProperty({ example: -2 }) @IsInt() @NotEquals(0) @Min(-100_000) @Max(100_000) delta: number;
  @ApiProperty({ example: 'Damaged' }) @IsString() @Length(2, 120) reason: string;
}

export class QuarantineDto {
  @ApiProperty({ example: 'Fridge 2 excursion' }) @IsString() @Length(2, 200) reason: string;
}

export class ReleaseDto {
  @ApiProperty({ description: 'Pharmacist confirms the batch was assessed and is fit for sale' })
  @Equals(true, { message: 'Confirm the quality assessment before releasing stock' })
  qualityAssessmentConfirmed: boolean;

  @ApiPropertyOptional() @IsOptional() @IsString() @Length(2, 300) note?: string;
}
