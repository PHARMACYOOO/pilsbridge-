import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Equals, IsEmail, IsOptional, IsString, Length } from 'class-validator';

export class UpdateProfileDto {
  @ApiProperty({ example: 'Chidi' })
  @IsString()
  @Length(1, 60)
  firstName: string;

  @ApiProperty({ example: 'Eze' })
  @IsString()
  @Length(1, 60)
  lastName: string;

  @ApiPropertyOptional({ example: 'chidi@example.com' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiProperty({ description: 'Consent to process health information to fulfil orders', example: true })
  @Equals(true, { message: 'Consent is required to use Pilbridge' })
  consent: boolean;
}
