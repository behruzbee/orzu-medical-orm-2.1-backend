// import { Controller, Get, Post, Body, Delete, Param } from '@nestjs/common';
// import { ReportsService } from './reports.service';
// import { GenerateReportDto } from './dto/generate-report.dto';

// @Controller('reports')
// export class ReportsController {
//   constructor(private readonly reportsService: ReportsService) {}

//   @Get()
//   findAll() {
//     return this.reportsService.findAll();
//   }

//   @Post('generate')
//   generate(@Body() dto: GenerateReportDto) {
//     return this.reportsService.generateReport(dto);
//   }

//   @Delete(':id')
//   remove(@Param('id') id: string) {
//     return this.reportsService.remove(id);
//   }
// }