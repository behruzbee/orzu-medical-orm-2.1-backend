import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class GenerateReportDto {
  @ApiProperty({ example: '2026-06-01' })
  @IsNotEmpty()
  @IsString()
  startDate: string;

  @ApiProperty({ example: '2026-06-30' })
  @IsNotEmpty()
  @IsString()
  endDate: string;
}
