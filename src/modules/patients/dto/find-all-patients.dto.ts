import {
  IsOptional,
  IsInt,
  Min,
  IsString,
  IsEnum,
  IsISO8601,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PatientStatus } from 'src/common/enums/patient-status.enum';

export class FindAllPatientsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 10;

  @IsOptional()
  @IsString()
  search?: string; // Общий поиск (имя или телефон)

  @IsOptional()
  @IsEnum(PatientStatus)
  status?: PatientStatus;

  @IsOptional()
  @IsString()
  branch?: string; // Филиал

  @IsOptional()
  @IsString()
  phoneCode?: string;

  @IsOptional()
  @IsISO8601()
  dateFrom?: string;

  @IsOptional()
  @IsISO8601()
  dateTo?: string;
}
