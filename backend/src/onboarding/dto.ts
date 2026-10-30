import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsDateString, IsEmail, IsEnum, IsIn, IsLatitude, IsLongitude, IsObject, IsOptional, IsString, Length, Max, Min, ValidateIf } from 'class-validator';
import { ApplicationStatus, PartnerKind, Role } from '../generated/prisma/client.js';

export class CreatePharmacyDto {
  @ApiProperty({ example: 'Grace Pharmacy' }) @IsString() @Length(2, 80) name: string;
  @ApiProperty({ example: 'Ikorodu', description: 'Shown to customers next to the name' }) @IsString() @Length(2, 60) area: string;
  @ApiProperty({ example: '5 Lagos Road, Ikorodu, Lagos' }) @IsString() @Length(5, 200) address: string;
  @ApiProperty({ example: 'PCN/PR/LA/0123' }) @IsString() @Length(3, 60) premisesLicenceNo: string;
  @ApiProperty({ example: '2027-06-30' }) @IsDateString() licenceExpiresAt: string;
  @ApiPropertyOptional({ example: 'Pharm. Ngozi Eze' }) @IsOptional() @IsString() @Length(2, 80) superintendentName?: string;
  @ApiPropertyOptional() @IsOptional() @IsEmail() email?: string;
  @ApiPropertyOptional({ example: '0803 000 0100', description: 'Counter phone couriers call at pickup' }) @IsOptional() @IsString() @Length(10, 20) phone?: string;
  @ApiPropertyOptional({ description: 'Has validated 2–8 °C storage' }) @IsOptional() @IsBoolean() coldChain?: boolean;
  @ApiPropertyOptional({ example: 6.6194 }) @ValidateIf((o: CreatePharmacyDto) => o.lng !== undefined) @IsLatitude() @Min(6.3) @Max(6.8) lat?: number;
  @ApiPropertyOptional({ example: 3.5105 }) @ValidateIf((o: CreatePharmacyDto) => o.lat !== undefined) @IsLongitude() @Min(2.7) @Max(4.4) lng?: number;
  @ApiPropertyOptional({ description: 'The partner application this pharmacy came from; it is marked approved' }) @IsOptional() @IsString() applicationId?: string;
}

/** Details admins correct after checking documents. Status changes go through verify / suspend. */
export class UpdatePharmacyDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(2, 80) name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(2, 60) area?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(5, 200) address?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(3, 60) premisesLicenceNo?: string;
  @ApiPropertyOptional({ example: '2027-06-30' }) @IsOptional() @IsDateString() licenceExpiresAt?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(2, 80) superintendentName?: string;
  @ApiPropertyOptional() @IsOptional() @IsEmail() email?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() coldChain?: boolean;
}

export class VerifyPharmacyDto {
  @ApiProperty({ example: 'PCN premises licence checked on the PCN portal, 23 Oct 2026; CAC certificate seen' })
  @IsString()
  @Length(10, 500)
  note: string;
}

export class SuspendPharmacyDto {
  @ApiProperty({ example: 'Premises licence under review by PCN' }) @IsString() @Length(5, 300) reason: string;
}

export const STAFF_ROLES = [Role.PHARMACIST, Role.PHARMACY_STAFF] as const;

export class AddStaffDto {
  @ApiProperty({ example: 'Ngozi' }) @IsString() @Length(1, 60) firstName: string;
  @ApiProperty({ example: 'Eze' }) @IsString() @Length(1, 60) lastName: string;
  @ApiProperty({ example: '0803 123 4567' }) @IsString() @Length(10, 20) phone: string;
  @ApiProperty({ enum: STAFF_ROLES, description: 'PHARMACIST: may approve prescriptions, release stock and approve transfers' }) @IsIn(STAFF_ROLES) role: (typeof STAFF_ROLES)[number];
  @ApiPropertyOptional({ example: 'PCN/RP/12345', description: 'Required for pharmacists' })
  @ValidateIf((o: AddStaffDto) => o.role === Role.PHARMACIST || o.pcnRegNo !== undefined)
  @IsString()
  @Length(3, 40)
  pcnRegNo?: string;
}

export class VerifyBankDto {
  @ApiProperty({ example: 'Account name matches CAC certificate; confirmed by phone with the superintendent' }) @IsString() @Length(10, 300) note: string;
}

// ——— Partner applications (public form) ———

export class PartnerApplicationDto {
  @ApiProperty({ enum: PartnerKind }) @IsEnum(PartnerKind) kind: PartnerKind;
  @ApiProperty({ example: 'Grace Pharmacy Ltd' }) @IsString() @Length(2, 120) organisation: string;
  @ApiPropertyOptional({ example: 'Ngozi Eze' }) @IsOptional() @IsString() @Length(2, 80) contactName?: string;
  @ApiProperty() @IsEmail() @Length(3, 120) email: string;
  @ApiProperty({ example: '0803 123 4567' }) @IsString() @Length(10, 20) phone: string;
  @ApiProperty({ description: 'The rest of the form: up to 20 short text answers', example: { cac: 'RC 123456', premises: 'PCN/PR/LA/0123' } })
  @IsObject()
  details: Record<string, unknown>;
}

export const REVIEW_STATUSES = [ApplicationStatus.CONTACTED, ApplicationStatus.APPROVED, ApplicationStatus.DECLINED] as const;

export class ReviewApplicationDto {
  @ApiProperty({ enum: REVIEW_STATUSES }) @IsIn(REVIEW_STATUSES) status: (typeof REVIEW_STATUSES)[number];
  @ApiPropertyOptional({ example: 'Called 23 Oct; documents requested' }) @IsOptional() @IsString() @Length(2, 500) note?: string;
}

/** Form answer keys: short camel-case names like "superintendent" or "coldChain". */
export const DETAIL_KEY = /^[a-zA-Z][a-zA-Z0-9]{0,29}$/;
