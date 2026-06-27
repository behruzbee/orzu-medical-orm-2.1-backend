import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsString, IsOptional } from 'class-validator';
import {
  EvidenceType,
  EvidenceSource,
} from '../entities/evidence-message.entity';

export class CreateEvidenceDto {
  @ApiProperty({ enum: EvidenceType, example: EvidenceType.TEXT })
  @IsEnum(EvidenceType)
  type: EvidenceType;

  @ApiPropertyOptional({ example: 'Patient message text.' })
  @IsString()
  @IsOptional()
  text?: string;

  @ApiPropertyOptional({ example: 'https://example.com/evidence/audio.mp3' })
  @IsString()
  @IsOptional()
  mediaUrl?: string;

  @ApiPropertyOptional({ example: '00:32' })
  @IsString()
  @IsOptional()
  duration?: string;

  @ApiPropertyOptional({ enum: EvidenceSource, example: EvidenceSource.MANUAL })
  @IsEnum(EvidenceSource)
  @IsOptional()
  source?: EvidenceSource;

  @ApiPropertyOptional({ enum: ['operator'], example: 'operator' })
  @IsString()
  @IsOptional()
  sender?: 'operator';

  @ApiPropertyOptional({ example: '2026-06-27T09:30:00.000Z' })
  @IsString()
  @IsOptional()
  originalTimestamp?: string;
}
