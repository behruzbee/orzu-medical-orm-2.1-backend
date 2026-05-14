import { IsEnum, IsString, IsOptional } from 'class-validator';
import {
  EvidenceType,
  EvidenceSource,
} from '../entities/evidence-message.entity';

export class CreateEvidenceDto {
  @IsEnum(EvidenceType)
  type: EvidenceType;

  @IsString()
  @IsOptional()
  text?: string;

  @IsString()
  @IsOptional()
  mediaUrl?: string;

  @IsString()
  @IsOptional()
  duration?: string;

  @IsEnum(EvidenceSource)
  @IsOptional()
  source?: EvidenceSource;

  @IsString()
  @IsOptional()
  sender?: 'operator';

  @IsString()
  @IsOptional()
  originalTimestamp?: string;
}
