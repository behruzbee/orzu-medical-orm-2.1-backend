import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateSubcategoryDto {
  @ApiProperty({ enum: ['complaint', 'suggestion'] })
  @IsIn(['complaint', 'suggestion'])
  type: 'complaint' | 'suggestion';

  @ApiProperty({ example: 'clinic' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  category: string;

  @ApiProperty({ example: 'Смеситель не работает' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  name: string;
}
