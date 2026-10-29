import {
  Controller,
  Get,
  Post,
  Body,
  Delete,
  Param,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { AuthGuard } from '@nestjs/passport';
import { ReportsService } from './reports.service';
import { GenerateReportDto } from './dto/generate-report.dto';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminGuard } from 'src/common/guards/admin.guard';

@ApiTags('Reports')
@ApiBearerAuth('jwt')
@UseGuards(AuthGuard('jwt'), AdminGuard)
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get()
  @ApiOperation({ summary: 'Get generated report history' })
  findAll() {
    return this.reportsService.findAll();
  }

  @Post('generate')
  @ApiOperation({ summary: 'Generate report for a date range' })
  generate(@Body() dto: GenerateReportDto) {
    return this.reportsService.generateReport(dto);
  }

  @Post(':id/regenerate')
  @ApiOperation({
    summary:
      'Recreate a missing report from current data, retaining its original history',
  })
  regenerate(@Param('id') id: string) {
    return this.reportsService.regenerateReport(id);
  }

  @Get(':id/download')
  @ApiOperation({ summary: 'Download a generated report' })
  async download(
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { name, stream } = await this.reportsService.openReport(id);
    res.set({
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="report.xlsx"; filename*=UTF-8''${encodeURIComponent(name)}`,
      'Cache-Control': 'no-store, private',
      'X-Content-Type-Options': 'nosniff',
    });
    return new StreamableFile(stream);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete report by ID' })
  remove(@Param('id') id: string) {
    return this.reportsService.remove(id);
  }
}
