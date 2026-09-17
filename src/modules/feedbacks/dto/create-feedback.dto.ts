import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsObject,
  IsArray,
  IsString,
  IsOptional,
  ValidateNested,
  IsBoolean,
  IsIn,
  IsNotEmpty,
  MaxLength,
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
  @IsNotEmpty()
  category: string;

  @ApiProperty({ example: 'Смеситель не работает' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  subcategory: string;

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
  @IsIn(['complaint', 'suggestion'])
  @IsOptional()
  type?: 'complaint' | 'suggestion';
}
