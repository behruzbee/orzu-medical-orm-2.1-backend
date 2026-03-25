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

import { ApiKeyGuard } from 'src/common/guards/api-keys.guard';

import { CreatePatientDto } from './dto/create-patient.dto';
import { FindAllPatientsDto } from './dto/find-all-patients.dto';
import { AddCallStatusDto } from '../call-history/dto/add-call-status.dto';
import { CreateFeedbackDto } from '../feedbacks/dto/create-feedback.dto';

import { PatientsService } from './services/patients.service';
import { PatientsImportService } from './services/patients-import.service';
import { PatientActionsService } from './services/patient-actions.service';
import { PatientsStatsService } from './services/patients-stats.service';

@Controller('patients')
export class PatientsController {
  constructor(
    private readonly patientsService: PatientsService,
    private readonly patientsImportService: PatientsImportService,
    private readonly patientActionsService: PatientActionsService,
    private readonly patientsStatsService: PatientsStatsService,
  ) {}

  @Post('webhook')
  @UseGuards(ApiKeyGuard)
  createExternal(@Body() dto: CreatePatientDto) {
    return this.patientsService.createFromExternal(dto);
  }

  @Get()
  @UseGuards(AuthGuard('jwt'))
  findAll(@Query() query: FindAllPatientsDto) {
    return this.patientsService.findAll(query);
  }

  @Get('stats')
  @UseGuards(AuthGuard('jwt')) 
  getStats() {
    return this.patientsStatsService.getStats();
  }

  @Get(':id')
  @UseGuards(AuthGuard('jwt'))
  findOne(@Param('id') id: string) {
    return this.patientsService.findOne(id);
  }

  @Delete(':id')
  @UseGuards(AuthGuard('jwt'))
  remove(@Param('id') id: string) {
    return this.patientsService.remove(id);
  }

  @Patch(':id/call-status')
  @UseGuards(AuthGuard('jwt'))
  async addCallStatus(
    @Param('id') id: string,
    @Body() dto: AddCallStatusDto,
    @Request() req,
  ) {
    if (!req.user || !req.user.id) {
      throw new UnauthorizedException('User ID not found in token');
    }

    return this.patientActionsService.addCallStatusTransactional(
      id,
      dto,
      req.user.id,
    );
  }

  @Patch(':id/revert-status')
  @UseGuards(AuthGuard('jwt'))
  async revertStatus(@Param('id') id: string) {
    return this.patientActionsService.revertStatus(id);
  }

  @Patch(':id/feedback')
  @UseGuards(AuthGuard('jwt'))
  async addFeedback(
    @Param('id') id: string,
    @Body() dto: CreateFeedbackDto,
    @Request() req,
  ) {
    if (!req.user || !req.user.id) {
      throw new UnauthorizedException('User ID not found in token');
    }

    return this.patientActionsService.addFeedbackTransactional(
      id,
      dto,
      req.user.id,
    );
  }

  @Post('import')
  @UseInterceptors(FileInterceptor('file'))
  async importPatients(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('Fayl yuklanmadi');
    }
    return this.patientsImportService.importFromExcel(file.buffer);
  }
}