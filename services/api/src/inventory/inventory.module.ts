// SPDX-License-Identifier: Apache-2.0
import { Module } from '@nestjs/common';
import { DbModule } from '../db/db.module';
import { DbService } from '../db/db.service';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';
import { INVENTORY_STORE, PostgresInventoryStore } from './inventory.store';

@Module({
  imports: [DbModule],
  controllers: [InventoryController],
  providers: [
    InventoryService,
    {
      provide: INVENTORY_STORE,
      useFactory: (db: DbService) => new PostgresInventoryStore(db),
      inject: [DbService],
    },
  ],
  exports: [InventoryService],
})
export class InventoryModule {}
