// SPDX-License-Identifier: Apache-2.0
import { Module } from '@nestjs/common';
import { DbModule } from '../db/db.module';
import { DbService } from '../db/db.service';
import { OutboxController } from './outbox.controller';
import { OutboxService } from './outbox.service';
import { OUTBOX_STORE, PostgresOutboxStore } from './outbox.store';

@Module({
  imports: [DbModule],
  controllers: [OutboxController],
  providers: [
    OutboxService,
    {
      provide: OUTBOX_STORE,
      useFactory: (db: DbService) => new PostgresOutboxStore(db),
      inject: [DbService],
    },
  ],
  exports: [OutboxService],
})
export class OutboxModule {}
