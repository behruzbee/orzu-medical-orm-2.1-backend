import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  Request,
  Query,
  UnauthorizedException,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { FindAllPatientsDto } from './dto/find-all-patients.dto';
import { AddCallStatusDto } from '../call-history/dto/add-call-status.dto';
import { CreateFeedbackDto } from '../feedbacks/dto/create-feedback.dto';

import { PatientsService } from './services/patients.service';
import { PatientsImportService } from './services/patients-import.service';
import { RequestActionsService } from './services/request-actions.service';
import { PatientsStatsService } from './services/patients-stats.service';

@ApiTags('Requests')
@ApiBearerAuth('jwt')
@Controller('requests')
@UseGuards(AuthGuard('jwt'))
export class RequestsController {
  constructor(
    private readonly patientsService: PatientsService,
    private readonly patientsImportService: PatientsImportService,
    private readonly patientActionsService: RequestActionsService,
    private readonly patientsStatsService: PatientsStatsService,
  ) {}

  // ==========================================
  // 📊 СПИСКИ И СТАТИСТИКА
  // ==========================================

  @Get()
  @ApiOperation({ summary: 'Get patient requests with filters and pagination' })
  findAll(@Query() query: FindAllPatientsDto) {
    return this.patientsService.findAll(query);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get request funnel statistics' })
  getStats() {
    return this.patientsStatsService.getStats();
  }

  // ==========================================
  // 🔍 ПРОСМОТР ЗАЯВКИ И ПРОФИЛЯ
  // ==========================================

  @Get(':requestId')
  @ApiOperation({ summary: 'Get one patient request by ID' })
  findOneRequest(@Param('requestId') requestId: string) {
    return this.patientsService.findOneRequest(requestId);
  }

  @Get('profile/:patientId')
  @ApiOperation({ summary: 'Get full patient profile with requests' })
  findOnePatientProfile(@Param('patientId') patientId: string) {
    return this.patientsService.findOnePatientProfile(patientId);
  }

  // ==========================================
  // 📞 ДЕЙСТВИЯ ОПЕРАТОРА (ВОРОНКА)
  // ==========================================

  @Post(':requestId/call-status')
  @ApiOperation({ summary: 'Add operator call status to a request' })
  async addCallStatus(
    @Param('requestId') requestId: string,
    @Body() dto: AddCallStatusDto,
    @Request() req,
  ) {
    if (!req.user || !req.user.id) {
      throw new UnauthorizedException('User ID not found in token');
    }
    return this.patientActionsService.addCallStatus(
      requestId,
      dto,
      req.user.id,
    );
  }

  @Post(':requestId/feedback')
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Add complaint or suggestion feedback' })
  async addFeedback(
    @Param('requestId') requestId: string,
    @Body() dto: CreateFeedbackDto,
    @Request() req,
  ) {
    const operatorId = req.user?.id || req.user?.sub;

    if (!operatorId) {
      throw new UnauthorizedException(
        'Не удалось получить ID оператора из токена',
      );
    }
    return this.patientActionsService.addFeedback(requestId, dto, operatorId);
  }

  @Post(':requestId/all-ok')
  @ApiOperation({ summary: 'Mark request as all ok' })
  async markAsAllOk(@Param('requestId') requestId: string, @Request() req) {
    if (!req.user || !req.user.id) {
      throw new UnauthorizedException('User ID not found');
    }
    return this.patientActionsService.markAsAllOk(requestId, req.user.id);
  }

  @Patch(':requestId/revert-status')
  @ApiOperation({ summary: 'Revert last call or feedback action' })
  async revertStatus(@Param('requestId') requestId: string) {
    return this.patientActionsService.revertStatus(requestId);
  }

  // ==========================================
  // 📥 ДВУХЭТАПНЫЙ ИМПОРТ EXCEL
  // ==========================================

  @Post('import/preview')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Upload Excel file and preview import result' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
      },
      required: ['file'],
    },
  })
  async previewImport(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('Fayl yuklanmadi');
    }
    return this.patientsImportService.previewImportFromExcel(file.buffer);
  }

  @Get('import/:sessionId/preview')
  @ApiOperation({ summary: 'Get saved import preview by session ID' })
  async getImportPreview(@Param('sessionId') sessionId: string) {
    return this.patientsImportService.getPreview(sessionId);
  }

  @Get('import/errors')
  @ApiOperation({ summary: 'Get import error log' })
  async getImportErrors(
    @Query('page') page: string,
    @Query('limit') limit: string,
    @Query('search') search?: string,
    @Query('category') category?: string,
    @Query('branch') branch?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.patientsImportService.getImportErrors(
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
      search,
      category,
      branch,
      startDate,
      endDate,
    );
  }

  @Post('import/:sessionId/commit')
  @ApiOperation({ summary: 'Commit a valid import preview' })
  async commitImport(@Param('sessionId') sessionId: string) {
    return this.patientsImportService.commitImport(sessionId);
  }

  @Delete('import/:sessionId/cancel')
  @ApiOperation({ summary: 'Cancel import preview session' })
  async cancelImport(@Param('sessionId') sessionId: string) {
    return this.patientsImportService.cancelImport(sessionId);
  }

  @Delete(':requestId')
  @ApiOperation({ summary: 'Archive a request' })
  async removeRequest(@Param('requestId') requestId: string) {
    return this.patientsService.softRemoveRequest(requestId);
  }

  @Delete('profile/:patientId')
  @ApiOperation({ summary: 'Archive a patient and all related requests' })
  async removePatient(@Param('patientId') patientId: string) {
    return this.patientsService.softRemovePatient(patientId);
  }

  @Patch('profile/:patientId/restore')
  @ApiOperation({ summary: 'Restore archived patient and requests' })
  async restorePatient(@Param('patientId') patientId: string) {
    return this.patientsService.restorePatient(patientId);
  }
  
}
