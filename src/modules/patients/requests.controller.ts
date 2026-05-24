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

import { FindAllPatientsDto } from './dto/find-all-patients.dto';
import { AddCallStatusDto } from '../call-history/dto/add-call-status.dto';
import { CreateFeedbackDto } from '../feedbacks/dto/create-feedback.dto';

import { PatientsService } from './services/patients.service';
import { PatientsImportService } from './services/patients-import.service';
import { RequestActionsService } from './services/request-actions.service';
import { PatientsStatsService } from './services/patients-stats.service';

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
  findAll(@Query() query: FindAllPatientsDto) {
    return this.patientsService.findAll(query);
  }

  @Get('stats')
  getStats() {
    return this.patientsStatsService.getStats();
  }

  // ==========================================
  // 🔍 ПРОСМОТР ЗАЯВКИ И ПРОФИЛЯ
  // ==========================================

  @Get(':requestId')
  findOneRequest(@Param('requestId') requestId: string) {
    return this.patientsService.findOneRequest(requestId);
  }

  @Get('profile/:patientId')
  findOnePatientProfile(@Param('patientId') patientId: string) {
    return this.patientsService.findOnePatientProfile(patientId);
  }

  // ==========================================
  // 📞 ДЕЙСТВИЯ ОПЕРАТОРА (ВОРОНКА)
  // ==========================================

  @Post(':requestId/call-status')
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
  async markAsAllOk(@Param('requestId') requestId: string, @Request() req) {
    if (!req.user || !req.user.id) {
      throw new UnauthorizedException('User ID not found');
    }
    return this.patientActionsService.markAsAllOk(requestId, req.user.id);
  }

  @Patch(':requestId/revert-status')
  async revertStatus(@Param('requestId') requestId: string) {
    return this.patientActionsService.revertStatus(requestId);
  }

  // ==========================================
  // 📥 ДВУХЭТАПНЫЙ ИМПОРТ EXCEL
  // ==========================================

  @Post('import/preview')
  @UseInterceptors(FileInterceptor('file'))
  async previewImport(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('Fayl yuklanmadi');
    }
    return this.patientsImportService.previewImportFromExcel(file.buffer);
  }

  @Get('import/:sessionId/preview')
  async getImportPreview(@Param('sessionId') sessionId: string) {
    return this.patientsImportService.getPreview(sessionId);
  }

  @Get('import/errors')
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
  async commitImport(@Param('sessionId') sessionId: string) {
    return this.patientsImportService.commitImport(sessionId);
  }

  @Delete('import/:sessionId/cancel')
  async cancelImport(@Param('sessionId') sessionId: string) {
    return this.patientsImportService.cancelImport(sessionId);
  }
}
