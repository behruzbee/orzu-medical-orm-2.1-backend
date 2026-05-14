import { IsEnum, IsNotEmpty } from 'class-validator';
import { RequestStatus } from 'src/common/enums/request-status.enum';

export class UpdatePatientStatusDto {
  @IsEnum(RequestStatus)
  @IsNotEmpty()
  status: RequestStatus;
}