import { IsString, Matches, IsNotEmpty, Length, IsOptional, IsEnum } from 'class-validator';

export class LoginDto {
  @IsEnum(['pin', 'qr'], { message: "Metod 'pin' yoki 'qr' bo'lishi kerak" })
  method: 'pin' | 'qr';

  // Обязательно только для метода 'pin'
  @IsOptional()
  @IsString()
  @Matches(/^\+998\d{9}$/, { message: "Telefon formati noto'g'ri (+998XXXXXXXXX)" })
  phone?: string;

  @IsOptional()
  @IsString()
  @Length(5, 5, { message: "PIN kod 5 ta raqamdan iborat bo'lishi kerak" })
  pin?: string;
}