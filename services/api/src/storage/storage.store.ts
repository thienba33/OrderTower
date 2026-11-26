// SPDX-License-Identifier: Apache-2.0
import { Injectable } from '@nestjs/common';
import { DbService } from '../db/db.service';
import type { FileStore, FileStatus, FileKind, StoredFile } from './storage.types';

export const FILE_STORE = 'FILE_STORE';

function copyFile(file: StoredFile): StoredFile {
  return JSON.parse(JSON.stringify(file)) as StoredFile;
}

function toIso(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  return value instanceof Date ? value.toISOString() : String(value);
}

export class InMemoryFileStore implements FileStore {
  private readonly files = new Map<string, StoredFile>();

  async save(file: StoredFile): Promise<void> {
    this.files.set(file.id, copyFile(file));
  }

  async findById(id: string): Promise<StoredFile | null> {
    const found = this.files.get(id);
    return found ? copyFile(found) : null;
  }

  async list(): Promise<StoredFile[]> {
    return [...this.files.values()]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map(copyFile);
  }
}

function mapRow(row: Record<string, unknown>): StoredFile {
  return {
    id: row.id as string,
    ownerId: row.owner_id as string,
    ownerUsername: row.owner_username as string,
    orderId: (row.order_id as string | null) ?? null,
    kind: row.kind as FileKind,
    title: (row.title as string | null) ?? null,
    category: (row.category as string | null) ?? null,
    objectKey: row.object_key as string,
    originalName: row.original_name as string,
    mime: row.mime as string,
    size: Number(row.size),
    sha256: row.sha256 as string,
    status: row.status as FileStatus,
    scanNote: (row.scan_note as string | null) ?? null,
    createdAt: toIso(row.created_at) ?? '',
    scannedAt: toIso(row.scanned_at),
    deletedAt: toIso(row.deleted_at),
    deleteReason: (row.delete_reason as string | null) ?? null,
  };
}

@Injectable()
export class PostgresFileStore implements FileStore {
  constructor(private readonly db: DbService) {}

  async save(file: StoredFile): Promise<void> {
    await this.db.query(
      `INSERT INTO files
         (id, owner_id, owner_username, order_id, kind, title, category,
          object_key, original_name, mime, size, sha256, status, scan_note,
          created_at, scanned_at, deleted_at, delete_reason)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
               $14, $15, $16, $17, $18)
       ON CONFLICT (id) DO UPDATE SET
         owner_id = EXCLUDED.owner_id,
         owner_username = EXCLUDED.owner_username,
         order_id = EXCLUDED.order_id,
         kind = EXCLUDED.kind,
         title = EXCLUDED.title,
         category = EXCLUDED.category,
         object_key = EXCLUDED.object_key,
         original_name = EXCLUDED.original_name,
         mime = EXCLUDED.mime,
         size = EXCLUDED.size,
         sha256 = EXCLUDED.sha256,
         status = EXCLUDED.status,
         scan_note = EXCLUDED.scan_note,
         created_at = EXCLUDED.created_at,
         scanned_at = EXCLUDED.scanned_at,
         deleted_at = EXCLUDED.deleted_at,
         delete_reason = EXCLUDED.delete_reason`,
      [
        file.id,
        file.ownerId,
        file.ownerUsername,
        file.orderId,
        file.kind,
        file.title,
        file.category,
        file.objectKey,
        file.originalName,
        file.mime,
        file.size,
        file.sha256,
        file.status,
        file.scanNote,
        file.createdAt,
        file.scannedAt,
        file.deletedAt,
        file.deleteReason,
      ],
    );
  }

  async findById(id: string): Promise<StoredFile | null> {
    const result = await this.db.query(
      `SELECT id, owner_id, owner_username, order_id, kind, title, category,
              object_key, original_name, mime, size, sha256, status,
              scan_note, created_at, scanned_at, deleted_at, delete_reason
         FROM files WHERE id = $1`,
      [id],
    );
    const row = result.rows[0] as Record<string, unknown> | undefined;
    return row ? mapRow(row) : null;
  }

  async list(): Promise<StoredFile[]> {
    const result = await this.db.query(
      `SELECT id, owner_id, owner_username, order_id, kind, title, category,
              object_key, original_name, mime, size, sha256, status,
              scan_note, created_at, scanned_at, deleted_at, delete_reason
         FROM files ORDER BY id`,
    );
    return (result.rows as Array<Record<string, unknown>>).map(mapRow);
  }
}
