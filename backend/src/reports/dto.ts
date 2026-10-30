import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsDateString, IsInt, IsOptional, IsString, Length, Max, Min, ValidateNested } from 'class-validator';

export class InvoiceLineDto {
  @ApiProperty({ example: 'RLY-88213' }) @IsString() @Length(1, 80) providerRef: string;
  @ApiProperty({ example: 180000, description: 'Kobo' }) @IsInt() @Min(0) @Max(100_000_000) amountKobo: number;
}

export class CreateInvoiceDto {
  @ApiProperty({ example: 'INV-2026-10-02' }) @IsString() @Length(1, 60) number: string;
  @ApiProperty({ example: '2026-10-01' }) @IsDateString() periodStart: string;
  @ApiProperty({ example: '2026-10-07' }) @IsDateString() periodEnd: string;

  @ApiProperty({ type: [InvoiceLineDto] })
  @ValidateNested({ each: true })
  @Type(() => InvoiceLineDto)
  @ArrayMinSize(1)
  @ArrayMaxSize(5000)
  lines: InvoiceLineDto[];
}

export class ReconcileInvoiceDto {
  @ApiPropertyOptional({ example: 'Disputed 3 lines by email; paid the rest on 14 Oct' }) @IsOptional() @IsString() @Length(2, 500) note?: string;
}
