import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Equals, IsEmail, IsEnum, IsIn, IsJWT, IsOptional, IsString, Length, Matches, ValidateIf } from 'class-validator';
import { SocialProvider } from '../generated/prisma/client.js';

/**
 * signin  — the number must already have an account.
 * signup  — the number must be new; the profile is sent with the code.
 * auto    — sign in or create, whichever applies (quick checkout flows).
 */
export const AUTH_INTENTS = ['signin', 'signup', 'auto'] as const;
export type AuthIntent = (typeof AUTH_INTENTS)[number];

export class RequestOtpDto {
  @ApiProperty({ example: '0803 123 4567' })
  @IsString()
  @Length(10, 20)
  phone: string;

  @ApiPropertyOptional({ enum: AUTH_INTENTS, default: 'auto' })
  @IsOptional()
  @IsIn(AUTH_INTENTS)
  intent?: AuthIntent;
}

export class VerifyOtpDto {
  @ApiProperty({ example: '0803 123 4567' })
  @IsString()
  @Length(10, 20)
  phone: string;

  @ApiProperty({ example: '123456' })
  @Matches(/^\d{6}$/, { message: 'Enter the 6-digit code' })
  code: string;

  @ApiPropertyOptional({ enum: AUTH_INTENTS, default: 'auto' })
  @IsOptional()
  @IsIn(AUTH_INTENTS)
  intent?: AuthIntent;

  // Required when intent is "signup": the account is created complete, in one step.
  @ApiPropertyOptional({ example: 'Chidi' })
  @ValidateIf((o: VerifyOtpDto) => o.intent === 'signup')
  @IsString()
  @Length(1, 60)
  firstName?: string;

  @ApiPropertyOptional({ example: 'Eze' })
  @ValidateIf((o: VerifyOtpDto) => o.intent === 'signup')
  @IsString()
  @Length(1, 60)
  lastName?: string;

  @ApiPropertyOptional({ example: 'chidi@example.com' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ description: 'Consent to process health information to fulfil orders' })
  @ValidateIf((o: VerifyOtpDto) => o.intent === 'signup')
  @Equals(true, { message: 'Consent is required to create an account' })
  consent?: boolean;
}

export class SocialSignInDto {
  @ApiProperty({ enum: SocialProvider })
  @IsEnum(SocialProvider)
  provider: SocialProvider;

  @ApiProperty({ description: 'The OpenID Connect ID token issued by Google or Apple' })
  @IsJWT()
  idToken: string;

  // Apple sends the name once, beside the token rather than in it. Only used when creating the account.
  @ApiPropertyOptional({ example: 'Ada' })
  @IsOptional()
  @IsString()
  @Length(1, 60)
  firstName?: string;

  @ApiPropertyOptional({ example: 'Obi' })
  @IsOptional()
  @IsString()
  @Length(1, 60)
  lastName?: string;
}

export class DemoSocialSignInDto {
  @ApiProperty({ enum: SocialProvider })
  @IsEnum(SocialProvider)
  provider: SocialProvider;

  @ApiProperty({ example: 'ada.obi@gmail.com' })
  @IsEmail()
  email: string;

  @ApiPropertyOptional({ example: 'Ada' })
  @IsOptional()
  @IsString()
  @Length(1, 60)
  firstName?: string;

  @ApiPropertyOptional({ example: 'Obi' })
  @IsOptional()
  @IsString()
  @Length(1, 60)
  lastName?: string;
}

export class AddPhoneDto {
  @ApiProperty({ example: '0803 123 4567' })
  @IsString()
  @Length(10, 20)
  phone: string;

  @ApiProperty({ example: '123456', description: 'From POST /auth/otp/request' })
  @Matches(/^\d{6}$/, { message: 'Enter the 6-digit code' })
  code: string;
}

export class MfaSetupDto {
  @ApiProperty({ description: 'The mfaToken from the sign-in response' }) @IsJWT() mfaToken: string;
}

export class MfaVerifyDto {
  @ApiProperty({ description: 'The mfaToken from the sign-in response' }) @IsJWT() mfaToken: string;

  @ApiProperty({ example: '123456', description: 'The 6-digit code from the authenticator app, or a recovery code like abcd-2345' })
  @IsString()
  @Length(6, 20)
  code: string;
}
