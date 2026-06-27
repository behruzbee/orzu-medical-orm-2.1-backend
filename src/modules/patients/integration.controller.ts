import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiSecurity,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { ApiKeyGuard } from 'src/common/guards/api-keys.guard';
import { CreateIntegrationRequestDto } from './dto/create-integration-request.dto';
import { PatientsService } from './services/patients.service';

@ApiTags('Integration')
@ApiSecurity('x-api-key')
@ApiUnauthorizedResponse({ description: 'Invalid or missing x-api-key header' })
@UseGuards(ApiKeyGuard)
@Controller('integration')
export class IntegrationController {
  constructor(private readonly patientsService: PatientsService) {}

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

  @Get('requests/:requestId')
  @ApiOperation({ summary: 'Get a patient request by ID' })
  @ApiOkResponse({ description: 'Patient request details.' })
  findRequest(@Param('requestId') requestId: string) {
    return this.patientsService.findOneRequest(requestId);
  }
}
