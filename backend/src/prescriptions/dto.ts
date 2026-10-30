import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional, IsString, Length, ValidateNested } from 'class-validator';

export enum ReviewDecision {
  APPROVE = 'APPROVE',
  REJECT = 'REJECT',
  CLARIFY = 'CLARIFY',
}

export class UploadPrescriptionDto {
  @ApiPropertyOptional({ example: 'Dr. K. Bello, Harbour Clinic' })
  @IsOptional()
  @IsString()
  @Length(2, 120)
  prescriberName?: string;
}

export class ProfessionalChecksDto {
  @ApiProperty() @IsBoolean() prescriberAndDateVerified: boolean;
  @ApiProperty() @IsBoolean() doseAndQuantityAppropriate: boolean;
  @ApiProperty() @IsBoolean() noInteractionOrAllergyConcerns: boolean;
}

export class ReviewPrescriptionDto {
  @ApiProperty({ enum: ReviewDecision }) @IsEnum(ReviewDecision) decision: ReviewDecision;

  @ApiPropertyOptional({ description: 'Required to reject or request clarification' })
  @IsOptional()
  @IsString()
  @Length(2, 500)
  note?: string;

  @ApiPropertyOptional({ type: ProfessionalChecksDto, description: 'Required to approve' })
  @IsOptional()
  @ValidateNested()
  @Type(() => ProfessionalChecksDto)
  checks?: ProfessionalChecksDto;
}
