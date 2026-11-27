// SPDX-License-Identifier: Apache-2.0
import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import type { Queryable } from '../db/db.types';
import {
  InMemoryOutboxStore,
  OUTBOX_STORE,
  type OutboxStore,
} from './outbox.store';
import type {
  NewOutboxEvent,
  OutboxEvent,
  OutboxFilters,
  OutboxRelayResult,
} from './outbox.types';

const MAX_LIMIT = 500;

function assertNonEmpty(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new BadRequestException(`${field} phải là chuỗi không rỗng.`);
  }
  return value.trim();
}

@Injectable()
export class OutboxService {
  private readonly logger = new Logger(OutboxService.name);

  constructor(
    @Optional()
    @Inject(OUTBOX_STORE)
    private readonly store: OutboxStore = new InMemoryOutboxStore(),
  ) {}

  // Ghi event trong cùng transaction với nghiệp vụ khi client được truyền.
  async append(
    input: NewOutboxEvent,
    client?: Queryable,
  ): Promise<OutboxEvent> {
    const type = assertNonEmpty(input.type, 'type');
    const aggregateType = assertNonEmpty(
      input.aggregateType,
      'aggregateType',
    );
    const aggregateId = assertNonEmpty(input.aggregateId, 'aggregateId');
    if (
      typeof input.payload !== 'object' ||
      input.payload === null ||
      Array.isArray(input.payload)
    ) {
      throw new BadRequestException('payload phải là 1 object.');
    }
    return this.store.append(
      { type, aggregateType, aggregateId, payload: input.payload },
      client,
    );
  }

  async list(filters: OutboxFilters): Promise<OutboxEvent[]> {
    const limit = filters.limit ?? 100;
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
      throw new BadRequestException(
        `limit phải là số nguyên từ 1 đến ${MAX_LIMIT}.`,
      );
    }
    return this.store.list({ ...filters, limit });
  }

  // Chưa có broker thật: relay đánh dấu event đã xử lý và trả danh sách để
  // demo/kiểm thử. Consumer thật có thể thay phần publish bằng webhook/broker.
  // Event lỗi được retry có backoff; quá max_attempts mới thành dead-letter.
  async relay(limit = 100): Promise<OutboxRelayResult> {
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
      throw new BadRequestException(
        `limit phải là số nguyên từ 1 đến ${MAX_LIMIT}.`,
      );
    }
    const pending = await this.store.listDuePending(limit);
    let processed = 0;
    let failed = 0;
    let retried = 0;
    const eventIds: number[] = [];
    for (const event of pending) {
      try {
        this.logger.log(
          `Phát outbox #${event.id} ${event.type} ${event.aggregateType}/${event.aggregateId}.`,
        );
        if (await this.store.markProcessed(event.id)) {
          processed += 1;
          eventIds.push(event.id);
        }
      } catch (error) {
        const outcome = await this.store.markFailed(
          event.id,
          error instanceof Error ? error.message : String(error),
        );
        if (outcome === 'retry') {
          retried += 1;
        } else {
          failed += 1;
        }
      }
    }
    return { processed, failed, retried, eventIds };
  }

  // Đưa event dead-letter trở lại pending để job relay thử lại từ đầu.
  async requeue(id: number): Promise<OutboxEvent> {
    if (!Number.isInteger(id) || id < 1) {
      throw new BadRequestException('id phải là số nguyên dương.');
    }
    const ok = await this.store.requeue(id);
    const event = ok ? await this.store.findById(id) : null;
    if (!event) {
      throw new NotFoundException(
        `Không tìm thấy event failed #${id} để đưa lại hàng đợi.`,
      );
    }
    return event;
  }
}
