import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsObject,
  IsArray,
  IsString,
  IsOptional,
  ValidateNested,
  IsBoolean,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CreateEvidenceDto } from './create-evidence.dto';

export class CreateFeedbackDto {
  @ApiProperty({
    example: { service: 5, doctor: 4, cleanliness: 5 },
    additionalProperties: { type: 'number' },
  })
  @IsObject()
  ratings: Record<string, number>;

  @ApiProperty({ example: 'service' })
  @IsString()
  category: string;

  @ApiPropertyOptional({ example: 'Patient liked the service.' })
  @IsString()
  @IsOptional()
  comment?: string;

  @ApiProperty({ type: [CreateEvidenceDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateEvidenceDto)
  evidence: CreateEvidenceDto[];

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  sendToTrello?: boolean;

  @ApiPropertyOptional({
    enum: ['complaint', 'suggestion'],
    example: 'complaint',
  })
  @IsString()
  @IsOptional()
  type?: 'complaint' | 'suggestion';
}
