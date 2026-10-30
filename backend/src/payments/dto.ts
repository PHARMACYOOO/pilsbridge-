import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsInt, IsOptional, IsPositive } from 'class-validator';

export class StartPaymentDto {
  @ApiPropertyOptional({ description: 'For the payment receipt, when the account has no email yet', example: 'ada@example.com' })
  @IsOptional()
  @IsEmail()
  email?: string;
}

export class ConfirmPaymentDto {
  @ApiProperty({ description: '`transaction_id` from the Flutterwave checkout callback', example: 285959875 })
  @IsInt()
  @IsPositive()
  transactionId: number;
}
