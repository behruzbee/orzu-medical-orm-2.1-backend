import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO8601, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class StatsPeriodQueryDto {
  @ApiProperty({
    example: '2026-06-01',
    description: 'Start date for the report period. Uses request arrivalDate.',
  })
  @IsNotEmpty()
  @IsISO8601()
  startDate: string;

  @ApiProperty({
    example: '2026-06-30',
    description: 'End date for the report period. Uses request arrivalDate.',
  })
  @IsNotEmpty()
  @IsISO8601()
  endDate: string;

  @ApiPropertyOptional({
    example: 'Orzu Medical Chilonzor',
    description: 'Optional branch filter.',
  })
  @IsOptional()
  @IsString()
  branch?: string;
}
