import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class GenerateReportDto {
  @ApiProperty({ example: '2026-06-01' })
  @IsNotEmpty()
  @IsString()
  startDate: string;

  @ApiProperty({ example: '2026-06-30' })
  @IsNotEmpty()
  @IsString()
  endDate: string;

  @ApiPropertyOptional({
    description: 'Include patient names, phone numbers and attachment links.',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  includePersonalData?: boolean;
}
