import { IsString, IsNotEmpty, IsISO8601, IsOptional, Matches } from 'class-validator';

export class CreatePatientDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @Matches(/^\+998\d{9}$/, { message: 'Telefon formati noto\'g\'ri (+998...)' })
  phone: string;

  @IsString()
  @IsNotEmpty()
  branch: string;

  @IsISO8601()
  departureDate: string;

  @IsISO8601()
  arrivalDate: string;

  @IsOptional()
  @Matches(/^#[0-9A-F]{6}$/i)
  avatarColor?: string;
}