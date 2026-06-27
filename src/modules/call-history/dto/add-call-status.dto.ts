import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsString, IsOptional } from 'class-validator';
import { RequestStatus } from 'src/common/enums/request-status.enum';

export class AddCallStatusDto {
  @ApiProperty({ enum: RequestStatus, example: RequestStatus.CONTACTED })
  @IsEnum(RequestStatus)
  status: RequestStatus;

  @ApiPropertyOptional({ example: 'Patient asked to call back tomorrow.' })
  @IsString()
  @IsOptional()
  note?: string;
}
