import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, Matches, Length, IsOptional, IsEnum } from 'class-validator';

export class LoginDto {
  @ApiProperty({ enum: ['pin', 'qr'], example: 'pin' })
  @IsEnum(['pin', 'qr'], { message: "Metod 'pin' yoki 'qr' bo'lishi kerak" })
  method: 'pin' | 'qr';

  // Обязательно только для метода 'pin'
  @ApiPropertyOptional({ example: '+998901234567' })
  @IsOptional()
  @IsString()
  @Matches(/^\+998\d{9}$/, {
    message: "Telefon formati noto'g'ri (+998XXXXXXXXX)",
  })
  phone?: string;

  @ApiPropertyOptional({ example: '12345' })
  @IsOptional()
  @IsString()
  @Length(5, 5, { message: "PIN kod 5 ta raqamdan iborat bo'lishi kerak" })
  pin?: string;
}
