import { Module } from '@nestjs/common';
import { ActivityModule } from '../activity/activity.module.js';
import { UsersModule } from '../users/users.module.js';
import { ShelfAccessService } from './shelf-access.service.js';
import { ShelvesController } from './shelves.controller.js';
import { ShelvesService } from './shelves.service.js';

@Module({
  imports: [ActivityModule, UsersModule],
  controllers: [ShelvesController],
  providers: [ShelvesService, ShelfAccessService],
  exports: [ShelvesService, ShelfAccessService],
})
export class ShelvesModule {}
