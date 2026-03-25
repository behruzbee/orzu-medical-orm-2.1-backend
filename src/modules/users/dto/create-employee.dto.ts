import {
  IsString,
  IsNotEmpty,
  Matches,
  IsOptional,
  Length,
  IsEnum,
} from 'class-validator';

export class CreateEmployeeDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @Matches(/^\+998\d{9}$/, {
    message: "Telefon raqam noto'g'ri formatda (+99890...)",
  })
  phone: string;

  @IsString()
  @IsOptional()
  @Length(5, 5, { message: "PIN kod 5 ta raqamdan iborat bo'lishi kerak" })
  pin?: string;

  @IsString()
  @IsOptional()
  @IsEnum(['operator'])
  role?: string;
}
