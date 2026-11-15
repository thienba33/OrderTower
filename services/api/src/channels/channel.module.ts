// SPDX-License-Identifier: Apache-2.0
import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { DbModule } from '../db/db.module';
import { DbService } from '../db/db.service';
import { ChannelsController } from './channel.controller';
import { ChannelsService } from './channel.service';
import { PostgresChannelStore, CHANNEL_STORE } from './channel.store';

@Module({
  imports: [AuditModule, DbModule],
  controllers: [ChannelsController],
  providers: [
    ChannelsService,
    {
      provide: CHANNEL_STORE,
      useFactory: (db: DbService) => new PostgresChannelStore(db),
      inject: [DbService],
    },
  ],
  exports: [ChannelsService],
})
export class ChannelsModule {}
