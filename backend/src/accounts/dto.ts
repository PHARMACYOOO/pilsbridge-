import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, Length } from 'class-validator';
import { Role } from '../generated/prisma/client.js';

export class FindUsersDto {
  @ApiPropertyOptional({ description: 'Phone, name or email', example: '0803 000 0001' }) @IsOptional() @IsString() @Length(2, 80) q?: string;
  @ApiPropertyOptional({ enum: Role }) @IsOptional() @IsEnum(Role) role?: Role;
}

export class ReasonDto {
  @ApiProperty({ example: 'Phone reported stolen' }) @IsString() @Length(5, 300) reason: string;
}

export class ChangePhoneDto {
  @ApiProperty({ example: '0803 123 4567', description: 'Their new number — not used by any account' }) @IsString() @Length(10, 20) phone: string;
  @ApiProperty({ example: 'New work SIM, confirmed by the superintendent on a call' }) @IsString() @Length(5, 300) reason: string;
}
