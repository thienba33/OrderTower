// SPDX-License-Identifier: Apache-2.0

export const FILE_KINDS = [
  'proof_photo',
  'document',
  'invoice',
  'attachment',
] as const;

export type FileKind = (typeof FILE_KINDS)[number];

export type FileStatus = 'pending' | 'clean' | 'infected' | 'deleted';

// Metadata của một object trong kho đối tượng. Nội dung file không nằm
// trong Postgres; chỉ có objectKey, hash và thông tin kiểm tra.
export interface StoredFile {
  id: string;
  ownerId: string;
  ownerUsername: string;
  orderId: string | null;
  kind: FileKind;
  title: string | null;
  category: string | null;
  objectKey: string;
  originalName: string;
  mime: string;
  size: number;
  sha256: string;
  status: FileStatus;
  scanNote: string | null;
  createdAt: string;
  scannedAt: string | null;
  deletedAt: string | null;
  deleteReason: string | null;
}

export interface FileFilters {
  orderId?: string;
  kind?: FileKind;
  status?: FileStatus;
  includeDeleted?: boolean;
}

export interface FileStore {
  save(file: StoredFile): Promise<void>;
  findById(id: string): Promise<StoredFile | null>;
  list(): Promise<StoredFile[]>;
}

export interface UploadFileInput {
  buffer: Buffer;
  originalName: string;
  mime: string;
  size: number;
  kind: FileKind;
  orderId?: string | null;
  title?: string | null;
  category?: string | null;
}

export interface StoredObject {
  body: Buffer;
  contentType: string | null;
}

export interface ObjectStorage {
  ensureBucket(): Promise<void>;
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<StoredObject>;
  delete(key: string): Promise<void>;
}

export type ClamScanStatus = 'clean' | 'infected' | 'error';

export interface ClamScanResult {
  status: ClamScanStatus;
  signature: string | null;
  note: string;
}
