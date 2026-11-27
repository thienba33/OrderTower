// SPDX-License-Identifier: Apache-2.0
import { Module } from '@nestjs/common';
import { DbModule } from '../db/db.module';
import { NotificationsController } from './notification.controller';
import { NotificationsService } from './notification.service';

@Module({
  imports: [DbModule],
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
