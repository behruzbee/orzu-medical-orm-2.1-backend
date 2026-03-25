import { IsEnum, IsNotEmpty } from 'class-validator';
import { PatientStatus } from 'src/common/enums/patient-status.enum';

export class UpdatePatientStatusDto {
  @IsEnum(PatientStatus)
  @IsNotEmpty()
  status: PatientStatus;
}