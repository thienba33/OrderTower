// SPDX-License-Identifier: Apache-2.0
import { Module } from '@nestjs/common';
import { DbService } from './db.service';
import {
  ID_SEQUENCE_STORE,
  IdSequenceService,
  PostgresIdSequenceStore,
} from './id-sequence';

@Module({
  providers: [
    DbService,
    IdSequenceService,
    {
      provide: ID_SEQUENCE_STORE,
      useFactory: (db: DbService) => new PostgresIdSequenceStore(db),
      inject: [DbService],
    },
  ],
  exports: [DbService, IdSequenceService, ID_SEQUENCE_STORE],
})
export class DbModule {}
