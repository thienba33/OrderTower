// SPDX-License-Identifier: Apache-2.0

export interface QueryResultLike {
  rows: unknown[];
  rowCount: number | null;
}

// Cổng truy vấn hẹp nhất mà mọi kho Postgres cần. Cả pg.Pool thật và pool
// của pg-mem đều thỏa interface này, nên kiểm thử kho chạy được trên pg-mem
// mà không cần máy chủ Postgres.
export interface Queryable {
  query(text: string, params?: unknown[]): Promise<QueryResultLike>;
}

// Queryable cộng khả năng chạy giao dịch. DbService cài đặt interface này;
// các kho cần ghi nhiều bảng trong 1 lần lưu (instance và lịch sử, đơn và
// lịch sử) nhận Transactional để toàn bộ lần lưu là nguyên tử.
export interface Transactional extends Queryable {
  withTransaction<T>(fn: (client: Queryable) => Promise<T>): Promise<T>;
}
