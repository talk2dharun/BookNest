import { Module } from '@nestjs/common';
import { ActivityModule } from '../activity/activity.module.js';
import { RealtimeModule } from '../realtime/realtime.module.js';
import { UsersModule } from '../users/users.module.js';
import { LendingController } from './lending.controller.js';
import { LendingService } from './lending.service.js';

@Module({
  imports: [ActivityModule, UsersModule, RealtimeModule],
  controllers: [LendingController],
  providers: [LendingService],
  exports: [LendingService],
})
export class LendingModule {}
