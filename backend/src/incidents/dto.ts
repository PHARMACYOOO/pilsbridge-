import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsString, Length } from 'class-validator';
import { IncidentType } from '../generated/prisma/client.js';

export class ReportIncidentDto {
  @ApiProperty({ enum: IncidentType }) @IsEnum(IncidentType) type: IncidentType;

  @ApiProperty({ example: 'Seal was broken when the parcel was handed over' })
  @IsString()
  @Length(5, 500)
  description: string;
}

export class ResolveIncidentDto {
  @ApiProperty({ example: 'Pharmacist inspected the return; stock written off; customer refunded' })
  @IsString()
  @Length(5, 500)
  resolution: string;
}
