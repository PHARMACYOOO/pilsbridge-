import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsIn, IsOptional, IsString, Length } from 'class-validator';
import { DocumentKind } from '../generated/prisma/client.js';

export const DOCUMENT_LABELS: Record<DocumentKind, { name: string; issuer: string; expires: boolean }> = {
  PREMISES_LICENCE: { name: 'Pharmacy premises licence', issuer: 'Pharmacists Council of Nigeria', expires: true },
  SUPERINTENDENT_LICENCE: { name: 'Superintendent pharmacist licence', issuer: 'Pharmacists Council of Nigeria', expires: true },
  CAC_CERTIFICATE: { name: 'Certificate of incorporation', issuer: 'Corporate Affairs Commission', expires: false },
  COLD_CHAIN_CALIBRATION: { name: 'Cold-chain fridge calibration', issuer: 'Accredited calibration provider', expires: true },
  INSURANCE: { name: 'Goods-in-transit insurance', issuer: 'Insurer', expires: true },
  OTHER: { name: 'Other document', issuer: '', expires: false },
};

/** Multipart fields sent with the file. */
export class UploadDocumentDto {
  @ApiProperty({ enum: DocumentKind }) @IsEnum(DocumentKind) kind: DocumentKind;
  @ApiProperty({ example: 'PCN/PR/LA/0123', description: 'Licence or certificate number' }) @IsString() @Length(2, 80) reference: string;
  @ApiPropertyOptional({ example: 'Pharmacists Council of Nigeria' }) @IsOptional() @IsString() @Length(2, 120) issuer?: string;
  @ApiPropertyOptional({ example: '2027-11-12', description: 'Required for documents that expire' }) @IsOptional() @IsDateString() expiresAt?: string;
}

export const DOCUMENT_DECISIONS = ['VERIFY', 'REJECT'] as const;

export class ReviewDocumentDto {
  @ApiProperty({ enum: DOCUMENT_DECISIONS }) @IsIn(DOCUMENT_DECISIONS) decision: (typeof DOCUMENT_DECISIONS)[number];
  @ApiPropertyOptional({ example: 'Checked on the PCN register', description: 'Required when rejecting' }) @IsOptional() @IsString() @Length(2, 500) note?: string;
  @ApiPropertyOptional({ example: '2027-11-12', description: 'The expiry date as checked, if it differs from what was entered' }) @IsOptional() @IsDateString() expiresAt?: string;
}
