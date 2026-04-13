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
  @IsObject()
  ratings: Record<string, number>;

  @IsString()
  @IsOptional()
  comment?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateEvidenceDto)
  evidence: CreateEvidenceDto[];

  @IsOptional()
  @IsBoolean()
  sendToTrello?: boolean;
}
