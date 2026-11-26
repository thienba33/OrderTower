// SPDX-License-Identifier: Apache-2.0
import { newDb } from 'pg-mem';
import type { Pool } from 'pg';
import { DbService } from './db.service';

// Tạo DbService chạy trên Postgres ảo của pg-mem, có migration đã áp dụng.
// Mỗi lần gọi tạo 1 DB ảo mới, độc lập với các test khác. Dùng cho kiểm thử
// kho Postgres và kiểm thử toàn app mà không cần máy chủ Postgres.
export async function createTestDbService(): Promise<DbService> {
  const memDb = newDb();
  const { Pool: MemPool } = memDb.adapters.createPg();
  const pool = new MemPool() as unknown as Pool;
  const service = new DbService(pool);
  await service.onModuleInit();
  return service;
}
