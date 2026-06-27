import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { CallHistoryService } from './call-history.service';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

@ApiTags('Call History')
@ApiBearerAuth('jwt')
@Controller('call-history')
@UseGuards(AuthGuard('jwt'))
export class CallHistoryController {
  constructor(private readonly callHistoryService: CallHistoryService) {}

  @Get('stats')
  @ApiOperation({ summary: 'Get operator call statistics' })
  async getStats(
    @Query('operatorId') operatorId: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    const startDate = from
      ? new Date(from)
      : new Date(new Date().setHours(0, 0, 0, 0));
    const endDate = to ? new Date(to) : new Date();

    return this.callHistoryService.getOperatorStats(
      operatorId,
      startDate,
      endDate,
    );
  }
}
