import { Controller, Get, Post, Body, Delete, Param } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { GenerateReportDto } from './dto/generate-report.dto';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

@ApiTags('Reports')
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

  @Delete(':id')
  @ApiOperation({ summary: 'Delete report by ID' })
  remove(@Param('id') id: string) {
    return this.reportsService.remove(id);
  }
}
