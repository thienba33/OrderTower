// SPDX-License-Identifier: Apache-2.0
import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { DbModule } from '../db/db.module';
import { DbService } from '../db/db.service';
import { ClamAvService } from './clamav.service';
import { OBJECT_STORAGE, InMemoryObjectStorage, S3ObjectStorage } from './object-storage';
import { StorageController } from './storage.controller';
import { StorageService } from './storage.service';
import { FILE_STORE, PostgresFileStore } from './storage.store';

@Module({
  imports: [AuditModule, DbModule],
  controllers: [StorageController],
  providers: [
    StorageService,
    ClamAvService,
    {
      provide: FILE_STORE,
      useFactory: (db: DbService) => new PostgresFileStore(db),
      inject: [DbService],
    },
    {
      provide: OBJECT_STORAGE,
      useFactory: () => {
        const endpoint = process.env.S3_ENDPOINT;
        if (!endpoint) {
          return new InMemoryObjectStorage();
        }
        return new S3ObjectStorage(
          process.env.S3_BUCKET ?? 'ordertower-chung-tu',
          endpoint,
          process.env.S3_ACCESS_KEY ?? '',
          process.env.S3_SECRET_KEY ?? '',
          process.env.S3_REGION ?? 'us-east-1',
        );
      },
    },
  ],
  exports: [StorageService, FILE_STORE, OBJECT_STORAGE],
})
export class StorageModule {}
