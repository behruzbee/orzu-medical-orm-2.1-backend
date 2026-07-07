import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  MessageEvent,
  Param,
  Patch,
  Post,
  Query,
  Request,
  Sse,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { JwtService } from '@nestjs/jwt';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { map, Observable } from 'rxjs';
import { CreateDoctorMessageDto } from './dto/create-doctor-message.dto';
import { DoctorMessagesService } from './doctor-messages.service';

@ApiTags('Doctor messages')
@Controller('doctor-messages')
export class DoctorMessagesController {
  constructor(
    private readonly doctorMessagesService: DoctorMessagesService,
    private readonly jwtService: JwtService,
  ) {}

  @Post(':requestId')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth('jwt')
  @ApiOperation({ summary: 'Send a patient-related message to doctors' })
  create(
    @Param('requestId') requestId: string,
    @Body() dto: CreateDoctorMessageDto,
    @Request() req,
  ) {
    const senderId = req.user?.id || req.user?.sub;

    if (!senderId) {
      throw new UnauthorizedException('User ID not found in token');
    }

    return this.doctorMessagesService.create(requestId, dto, senderId);
  }

  @Get('pending')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth('jwt')
  @ApiOperation({ summary: 'Get open messages that doctors must close' })
  findPending(@Request() req) {
    this.ensureDoctorAccess(req.user);
    return this.doctorMessagesService.findPending();
  }

  @Patch(':id/done')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth('jwt')
  @ApiOperation({ summary: 'Mark a doctor message as done' })
  markDone(@Param('id') id: string, @Request() req) {
    this.ensureDoctorAccess(req.user);

    const doctorId = req.user?.id || req.user?.sub;

    if (!doctorId) {
      throw new UnauthorizedException('User ID not found in token');
    }

    return this.doctorMessagesService.markDone(id, doctorId);
  }

  @Sse('stream')
  @ApiOperation({ summary: 'Stream doctor message events' })
  @ApiQuery({ name: 'token', required: true })
  stream(@Query('token') token?: string): Observable<MessageEvent> {
    const user = this.verifyStreamToken(token);
    this.ensureDoctorAccess(user);

    return this.doctorMessagesService.stream().pipe(map((data) => ({ data })));
  }

  private verifyStreamToken(token?: string) {
    if (!token) {
      throw new UnauthorizedException('Token is required');
    }

    try {
      const payload = this.jwtService.verify(token);
      return {
        id: payload.sub,
        phone: payload.phone,
        role: payload.role,
      };
    } catch {
      throw new UnauthorizedException('Invalid token');
    }
  }

  private ensureDoctorAccess(user?: { role?: string }) {
    if (!user || !['doctor', 'admin'].includes(user.role || '')) {
      throw new ForbiddenException('Faqat shifokorlar uchun');
    }
  }
}
