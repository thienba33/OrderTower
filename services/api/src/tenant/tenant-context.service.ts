// SPDX-License-Identifier: Apache-2.0
import { AsyncLocalStorage } from 'node:async_hooks';
import { Injectable } from '@nestjs/common';

export const DEFAULT_TENANT_ID = 'default';

// Giữ tenant của request hiện tại xuyên qua các lớp async mà không phải
// truyền tham số tenant qua mọi service/store.
@Injectable()
export class TenantContextService {
  private readonly storage = new AsyncLocalStorage<string>();

  run<T>(tenantId: string | undefined | null, fn: () => T): T {
    const value =
      typeof tenantId === 'string' && tenantId.trim() !== ''
        ? tenantId.trim()
        : DEFAULT_TENANT_ID;
    return this.storage.run(value, fn);
  }

  getTenantId(): string {
    return this.storage.getStore() ?? DEFAULT_TENANT_ID;
  }
}
