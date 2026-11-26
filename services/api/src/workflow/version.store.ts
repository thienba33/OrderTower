// SPDX-License-Identifier: Apache-2.0
import { Injectable } from '@nestjs/common';
import type { Transactional } from '../db/db.types';

export const WORKFLOW_VERSION_STORE = 'WORKFLOW_VERSION_STORE';

// Lưu version đang active của từng definition để restart API vẫn giữ
// quyết định deploy đã được duyệt. Bản thân definition vẫn nằm trong file
// JSON có version; bảng này chỉ ghi con trỏ active.
export interface WorkflowVersionStore {
  listActiveVersions(): Promise<Map<string, string>>;
  setActiveVersion(
    definitionId: string,
    version: string,
    updatedBy: string,
  ): Promise<void>;
}

export class InMemoryWorkflowVersionStore implements WorkflowVersionStore {
  private readonly active = new Map<
    string,
    { version: string; updatedBy: string }
  >();

  async listActiveVersions(): Promise<Map<string, string>> {
    return new Map(
      [...this.active.entries()].map(([id, value]) => [id, value.version]),
    );
  }

  async setActiveVersion(
    definitionId: string,
    version: string,
    updatedBy: string,
  ): Promise<void> {
    this.active.set(definitionId, { version, updatedBy });
  }
}

export class PostgresWorkflowVersionStore implements WorkflowVersionStore {
  constructor(private readonly db: Transactional) {}

  async listActiveVersions(): Promise<Map<string, string>> {
    const result = await this.db.query(
      'SELECT definition_id, version FROM workflow_active_versions',
    );
    return new Map(
      (result.rows as Array<{ definition_id: string; version: string }>).map(
        (row) => [row.definition_id, row.version],
      ),
    );
  }

  async setActiveVersion(
    definitionId: string,
    version: string,
    updatedBy: string,
  ): Promise<void> {
    await this.db.query(
      `INSERT INTO workflow_active_versions
         (definition_id, version, updated_by, updated_at)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (definition_id) DO UPDATE SET
         version = EXCLUDED.version,
         updated_by = EXCLUDED.updated_by,
         updated_at = now()`,
      [definitionId, version, updatedBy],
    );
  }
}
