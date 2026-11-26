// SPDX-License-Identifier: Apache-2.0
import { Inject, Injectable, Optional } from '@nestjs/common';
import type { Queryable, Transactional } from './db.types';

export const ID_SEQUENCE_STORE = 'ID_SEQUENCE_STORE';

// Cấp số thứ tự nguyên tử cho các mã DH/LS/WF. Bản Postgres dùng bảng
// id_counters để nhiều request hoặc nhiều tiến trình không cấp trùng.
export interface IdSequenceStore {
  next(name: string, initial: number, client?: Queryable): Promise<number>;
}

export class InMemoryIdSequenceStore implements IdSequenceStore {
  private readonly counters = new Map<string, number>();

  async next(
    name: string,
    initial: number,
    _client?: Queryable,
  ): Promise<number> {
    const current = this.counters.get(name) ?? initial;
    this.counters.set(name, current + 1);
    return current;
  }
}

export class PostgresIdSequenceStore implements IdSequenceStore {
  constructor(private readonly db: Transactional) {}

  async next(
    name: string,
    initial: number,
    client?: Queryable,
  ): Promise<number> {
    const runner = client ?? this.db;
    // value là ID kế tiếp sẽ cấp. Lần đầu insert initial + 1 rồi trả
    // initial; các lần sau tăng value thêm 1 và trả value cũ. GREATEST bảo
    // vệ trường hợp DB được restore từ bản có ID lớn hơn counter hiện tại.
    const result = await runner.query(
      `INSERT INTO id_counters (name, value)
       VALUES ($1, $2 + 1)
       ON CONFLICT (name) DO UPDATE SET
         value = GREATEST(id_counters.value, $2) + 1
       RETURNING value - 1 AS value`,
      [name, initial],
    );
    const row = result.rows[0] as { value: number | string } | undefined;
    if (!row) {
      throw new Error(`Không cấp được số thứ tự cho ${name}.`);
    }
    return Number(row.value);
  }
}

@Injectable()
export class IdSequenceService {
  constructor(
    @Optional()
    @Inject(ID_SEQUENCE_STORE)
    private readonly store: IdSequenceStore = new InMemoryIdSequenceStore(),
  ) {}

  async next(
    name: string,
    initial: number,
    client?: Queryable,
  ): Promise<number> {
    if (typeof name !== 'string' || name.trim() === '') {
      throw new Error('Tên bộ đếm ID phải là chuỗi không rỗng.');
    }
    if (!Number.isInteger(initial) || initial < 1) {
      throw new Error(`Giá trị khởi tạo của ${name} phải là số nguyên dương.`);
    }
    return this.store.next(name, initial, client);
  }
}
