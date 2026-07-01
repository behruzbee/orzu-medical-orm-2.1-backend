import {
  Body,
  Controller,
  Get,
  Param,
  ParseEnumPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiSecurity,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { ApiKeyGuard } from 'src/common/guards/api-keys.guard';
import {
  REPORT_METRIC_DEFINITIONS,
  REPORT_RATING_CATEGORIES,
  REPORT_SCORE_VALUES,
  REPORT_TOTAL_RATING_CATEGORY,
  ReportMetricKey,
  ReportStatsService,
} from 'src/common/report-stats/report-stats.service';
import { RequestStatus } from 'src/common/enums/request-status.enum';
import { CreateIntegrationRequestDto } from './dto/create-integration-request.dto';
import { StatsPeriodQueryDto } from './dto/stats-period-query.dto';
import { PatientsService } from './services/patients.service';

@ApiTags('Integration')
@ApiSecurity('x-api-key')
@ApiUnauthorizedResponse({ description: 'Invalid or missing x-api-key header' })
@UseGuards(ApiKeyGuard)
@Controller('integration')
export class IntegrationController {
  constructor(
    private readonly patientsService: PatientsService,
    private readonly reportStatsService: ReportStatsService,
  ) {}

  @Get('health')
  @ApiOperation({ summary: 'Check integration API key and API availability' })
  @ApiOkResponse({
    description: 'The integration key is valid and API is available.',
  })
  health() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }

  @Post('requests')
  @ApiOperation({ summary: 'Create a patient request from an external system' })
  @ApiCreatedResponse({ description: 'Patient request was created.' })
  createRequest(@Body() dto: CreateIntegrationRequestDto) {
    return this.patientsService.createFromIntegration(dto);
  }

  @Get('report-stats/catalog')
  @ApiOperation({ summary: 'Get available report-stat metrics and ratings' })
  @ApiOkResponse({
    description: 'Available metric keys, rating categories and scores.',
  })
  getReportStatsCatalog() {
    return {
      metrics: this.reportStatsService.getMetricDefinitions(),
      ratingCategories: this.reportStatsService.getRatingCategoryDefinitions(),
      scores: REPORT_SCORE_VALUES,
      statuses: Object.values(RequestStatus),
    };
  }

  @Get('report-stats')
  @ApiOperation({ summary: 'Get all report-stat values by period' })
  @ApiOkResponse({
    description:
      'All report-stat values exactly as calculated for Excel report.',
  })
  getReportStats(@Query() query: StatsPeriodQueryDto) {
    return this.reportStatsService.getReportStats(query);
  }

  @Get('report-stats/transferred-numbers')
  @ApiOperation({ summary: 'Get report column: кол. переданных номеров' })
  getTransferredNumbers(@Query() query: StatsPeriodQueryDto) {
    return this.getReportMetric(query, 'transferred-numbers');
  }

  @Get('report-stats/incorrect/wrong-number')
  @ApiOperation({ summary: 'Get report column: не правильный номер' })
  getWrongNumbers(@Query() query: StatsPeriodQueryDto) {
    return this.getReportMetric(query, 'wrong-number');
  }

  @Get('report-stats/incorrect/employee-number')
  @ApiOperation({ summary: 'Get report column: номер сотрудников' })
  getEmployeeNumbers(@Query() query: StatsPeriodQueryDto) {
    return this.getReportMetric(query, 'employee-number');
  }

  @Get('report-stats/incorrect/has-not-whatsapp')
  @ApiOperation({ summary: 'Get report column: нет ватсапа' })
  getHasNotWhatsapp(@Query() query: StatsPeriodQueryDto) {
    return this.getReportMetric(query, 'has-not-whatsapp');
  }

  @Get('report-stats/incorrect/total')
  @ApiOperation({ summary: 'Get report columns: не корректно / всего and %' })
  getIncorrectTotal(@Query() query: StatsPeriodQueryDto) {
    return this.getReportMetric(query, 'incorrect-total');
  }

  @Get('report-stats/correct/called')
  @ApiOperation({ summary: 'Get report columns: корректно / обзвон and %' })
  getCalled(@Query() query: StatsPeriodQueryDto) {
    return this.getReportMetric(query, 'called');
  }

  @Get('report-stats/correct/duplicates')
  @ApiOperation({ summary: 'Get report column: корректно / дубликаты' })
  getDuplicates(@Query() query: StatsPeriodQueryDto) {
    return this.getReportMetric(query, 'duplicates');
  }

  @Get('report-stats/correct/no-answer')
  @ApiOperation({ summary: 'Get report column: корректно / не ответили' })
  getNoAnswer(@Query() query: StatsPeriodQueryDto) {
    return this.getReportMetric(query, 'no-answer');
  }

  @Get('report-stats/correct/unreachable')
  @ApiOperation({ summary: 'Get report column: корректно / номер отключен' })
  getUnreachable(@Query() query: StatsPeriodQueryDto) {
    return this.getReportMetric(query, 'unreachable');
  }

  @Get('report-stats/correct/total')
  @ApiOperation({ summary: 'Get report columns: корректно / Всего and %' })
  getCorrectTotal(@Query() query: StatsPeriodQueryDto) {
    return this.getReportMetric(query, 'correct-total');
  }

  @Get('report-stats/feedback/complaints')
  @ApiOperation({ summary: 'Get report columns: жалобы / кол жалоб and %' })
  getComplaints(@Query() query: StatsPeriodQueryDto) {
    return this.getReportMetric(query, 'complaints');
  }

  @Get('report-stats/feedback/suggestions')
  @ApiOperation({ summary: 'Get report column: жалобы / предложение' })
  getSuggestions(@Query() query: StatsPeriodQueryDto) {
    return this.getReportMetric(query, 'suggestions');
  }

  @Get('report-stats/feedback/not-related-complaints')
  @ApiOperation({
    summary: 'Get report column: жалобы которые не относятся к клинике',
  })
  getNotRelatedComplaints(@Query() query: StatsPeriodQueryDto) {
    return this.getReportMetric(query, 'not-related-complaints');
  }

  @Get('report-stats/metrics/:metric')
  @ApiOperation({ summary: 'Get any report metric by metric key' })
  @ApiParam({ name: 'metric', enum: Object.keys(REPORT_METRIC_DEFINITIONS) })
  getMetric(
    @Param('metric') metric: string,
    @Query() query: StatsPeriodQueryDto,
  ) {
    return this.reportStatsService.getMetric(query, metric);
  }

  @Get('report-stats/ratings/:category/:score')
  @ApiOperation({ summary: 'Get one rating score from report by period' })
  @ApiParam({
    name: 'category',
    enum: [
      ...REPORT_RATING_CATEGORIES.map((category) => category.id),
      REPORT_TOTAL_RATING_CATEGORY.id,
    ],
  })
  @ApiParam({ name: 'score', enum: [...REPORT_SCORE_VALUES] })
  getRatingScore(
    @Param('category') category: string,
    @Param('score') score: string,
    @Query() query: StatsPeriodQueryDto,
  ) {
    return this.reportStatsService.getRatingScore(query, category, score);
  }

  @Get('report-stats/ratings/:category')
  @ApiOperation({
    summary: 'Get report rating category with 5/4/3/2 counts and percentages',
  })
  @ApiParam({
    name: 'category',
    enum: [
      ...REPORT_RATING_CATEGORIES.map((category) => category.id),
      REPORT_TOTAL_RATING_CATEGORY.id,
    ],
  })
  getRatingCategory(
    @Param('category') category: string,
    @Query() query: StatsPeriodQueryDto,
  ) {
    return this.reportStatsService.getRatingCategory(query, category);
  }

  @Get('report-stats/status/:status')
  @ApiOperation({ summary: 'Get request status count in report period' })
  @ApiParam({ name: 'status', enum: RequestStatus })
  getStatusCount(
    @Param('status', new ParseEnumPipe(RequestStatus)) status: RequestStatus,
    @Query() query: StatsPeriodQueryDto,
  ) {
    return this.reportStatsService.getStatusCount(query, status);
  }

  @Get('requests/:requestId')
  @ApiOperation({ summary: 'Get a patient request by ID' })
  @ApiOkResponse({ description: 'Patient request details.' })
  findRequest(@Param('requestId') requestId: string) {
    return this.patientsService.findOneRequest(requestId);
  }

  private getReportMetric(query: StatsPeriodQueryDto, metric: ReportMetricKey) {
    return this.reportStatsService.getMetric(query, metric);
  }
}
