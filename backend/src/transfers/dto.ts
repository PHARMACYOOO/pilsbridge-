import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Equals, IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';

export class CreateTransferDto {
  @ApiProperty({ description: 'A batch at your pharmacy' }) @IsString() batchId: string;
  @ApiProperty({ example: 20, description: 'Packs' }) @IsInt() @Min(1) @Max(100_000) quantity: number;
  @ApiPropertyOptional({ description: 'Offer to one pharmacy. Leave out to offer to every verified pharmacy' }) @IsOptional() @IsString() toPharmacyId?: string;
  @ApiPropertyOptional({ example: 'Surplus after a cancelled clinic order' }) @IsOptional() @IsString() @Length(2, 300) note?: string;
}

export class TransferReasonDto {
  @ApiProperty({ example: 'We have enough stock of this' }) @IsString() @Length(2, 300) reason: string;
}

export class ReceiveTransferDto {
  @ApiProperty({ description: 'Pharmacist confirms seal, packaging, batch number and expiry match, and nothing is damaged' })
  @Equals(true, { message: 'Check the stock’s condition before receiving it' })
  conditionConfirmed: boolean;

  @ApiProperty({ example: 120000, description: 'Your selling price per pack, in kobo (used for a new batch; an existing batch keeps its price)' })
  @IsInt()
  @Min(1)
  @Max(100_000_000)
  priceKobo: number;

  @ApiPropertyOptional({ example: 'Shelf B3' }) @IsOptional() @IsString() @Length(1, 40) location?: string;
}
