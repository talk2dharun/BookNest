import { Module } from '@nestjs/common';
import { ActivityModule } from '../activity/activity.module.js';
import { LendingModule } from '../lending/lending.module.js';
import { RealtimeModule } from '../realtime/realtime.module.js';
import { BooksController } from './books.controller.js';
import { BooksService } from './books.service.js';

@Module({
  imports: [ActivityModule, RealtimeModule, LendingModule],
  controllers: [BooksController],
  providers: [BooksService],
  exports: [BooksService],
})
export class BooksModule {}
