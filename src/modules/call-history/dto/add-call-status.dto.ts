import { IsEnum, IsString, IsOptional } from 'class-validator';
import { RequestStatus } from 'src/common/enums/request-status.enum';

export class AddCallStatusDto {
  @IsEnum(RequestStatus)
  status: RequestStatus;

  @IsString()
  @IsOptional()
  note?: string;
}
