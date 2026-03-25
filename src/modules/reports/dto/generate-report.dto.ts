import { IsNotEmpty, IsString } from 'class-validator';

export class GenerateReportDto {
  @IsNotEmpty()
  @IsString() 
  startDate: string;

  @IsNotEmpty()
  @IsString()
  endDate: string;
}