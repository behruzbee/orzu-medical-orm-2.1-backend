import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class CreateDoctorMessageDto {
  @ApiProperty({
    example:
      'Bemorga klizma buyurilgan, lekin kerak emas. Iltimos, tayinlovni tekshirib bering.',
  })
  @IsString()
  @MinLength(3)
  @MaxLength(2000)
  message: string;
}
