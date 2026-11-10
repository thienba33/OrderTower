// SPDX-License-Identifier: Apache-2.0
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Pool } from 'pg';
import type { Queryable, QueryResultLike, Transactional } from './db.types';

// Kết nối Postgres và chạy migration có phiên bản. Pool lấy từ DATABASE_URL;
// thiếu biến thì chặn khởi động với lỗi rõ ràng. Migration chạy 1 lần lúc
// khởi động, mỗi tệp trong 1 giao dịch riêng, phiên bản đã áp dụng ghi vào
// bảng schema_migrations nên chạy lại là không làm gì thêm.
@Injectable()
export class DbService implements Transactional, OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DbService.name);
  private readonly pool: Pool;

  // pool chỉ dùng cho kiểm thử: truyền pool của pg-mem để chạy trên DB ảo
  // mà không cần máy chủ Postgres. Khi không truyền, đọc DATABASE_URL.
  constructor(pool?: Pool) {
    if (pool) {
      this.pool = pool;
      return;
    }
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error(
        'Thiếu biến môi trường DATABASE_URL. Đặt DATABASE_URL trong .env (xem .env.example) rồi khởi động lại API.',
      );
    }
    this.pool = new Pool({ connectionString: url });
  }

  async query(text: string, params?: unknown[]): Promise<QueryResultLike> {
    return this.pool.query(text, params);
  }

  async withTransaction<T>(fn: (client: Queryable) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async onModuleInit(): Promise<void> {
    await this.runMigrations();
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }

  async runMigrations(): Promise<void> {
    // Ghi chú về pg-mem: CREATE TABLE IF NOT EXISTS có ràng buộc (khóa chính,
    // NOT NULL, DEFAULT) chạy lần 2 trên bảng đã tồn tại sẽ lỗi trong pg-mem
    // 3.0.14, dù Postgres thật bỏ qua đúng. Vì vậy runner KHÔNG tự tạo bảng
    // schema_migrations; migration 001 tạo nó khi DB còn trống. Runner chỉ
    // đọc danh sách đã áp dụng, bảng chưa có nghĩa là chưa áp dụng gì.
    const appliedSet = await this.readAppliedVersions();
    const dir = this.resolveMigrationsDir();
    const files = readdirSync(dir)
      .filter((file) => file.endsWith('.sql'))
      .sort();
    for (const file of files) {
      const version = file.replace(/\.sql$/, '');
      if (appliedSet.has(version)) {
        continue;
      }
      const sql = readFileSync(join(dir, file), 'utf-8');
      await this.withTransaction(async (client) => {
        await client.query(sql);
        await client.query(
          'INSERT INTO schema_migrations (version) VALUES ($1)',
          [version],
        );
      });
      this.logger.log(`Đã áp dụng migration ${version}.`);
    }
  }

  // Trả về tập phiên bản đã áp dụng; bảng chưa tồn tại nghĩa là chưa có gì.
  private async readAppliedVersions(): Promise<Set<string>> {
    try {
      const applied = await this.query(
        'SELECT version FROM schema_migrations ORDER BY version',
      );
      return new Set(
        (applied.rows as Array<{ version: string }>).map(
          (row) => row.version,
        ),
      );
    } catch {
      return new Set<string>();
    }
  }

  private resolveMigrationsDir(): string {
    // Gói build copy tệp migration vào dist/db/migrations (xem nest-cli.json),
    // còn khi chạy từ mã nguồn thì tệp nằm ở src/db/migrations.
    return join(__dirname, 'migrations');
  }
}
