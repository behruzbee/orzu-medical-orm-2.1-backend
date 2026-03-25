import { IsEnum, IsString, IsOptional } from 'class-validator';
import { PatientStatus } from 'src/common/enums/patient-status.enum';

export class AddCallStatusDto {
  @IsEnum(PatientStatus)
  status: PatientStatus;

  @IsString()
  @IsOptional()
  note?: string;
}
