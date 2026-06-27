import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO8601, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateIntegrationRequestDto {
  @ApiProperty({ example: 'Ali Valiyev' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({
    example: '+998901234567',
    description:
      'Patient phone number. Spaces, brackets and dashes are allowed.',
  })
  @IsString()
  @IsNotEmpty()
  phone: string;

  @ApiProperty({ example: 'Orzu Medical Chilonzor' })
  @IsString()
  @IsNotEmpty()
  branch: string;

  @ApiProperty({
    example: '2026-06-27T09:00:00.000Z',
    description: 'Patient arrival date in ISO 8601 format.',
  })
  @IsISO8601()
  arrivalDate: string;

  @ApiProperty({
    example: '2026-06-30T09:00:00.000Z',
    description: 'Patient departure date in ISO 8601 format.',
  })
  @IsISO8601()
  departureDate: string;

  @ApiPropertyOptional({
    example: 'HIS-123456',
    description: 'Optional identifier from the external system.',
  })
  @IsOptional()
  @IsString()
  externalId?: string;
}
