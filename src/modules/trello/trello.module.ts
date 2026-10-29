import { Module } from '@nestjs/common';
import { TrelloController } from './trello.controller';
import { TrelloService } from './services/trello.service';
import { TrelloSlaService } from './services/trello-sla.service';

@Module({
  controllers: [TrelloController],
  providers: [
    TrelloService, 
    TrelloSlaService
  ],
  exports: [TrelloService],
})
export class TrelloModule {}
