// SPDX-License-Identifier: Apache-2.0
import { Logger } from '@nestjs/common';
import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import type { ObjectStorage, StoredObject } from './storage.types';

export const OBJECT_STORAGE = 'OBJECT_STORAGE';

// Kho object SeaweedFS qua giao thức S3. Dùng path-style vì SeaweedFS mini
// không chạy virtual-host bucket.
export class S3ObjectStorage implements ObjectStorage {
  private readonly logger = new Logger(S3ObjectStorage.name);
  private readonly client: S3Client;

  constructor(
    private readonly bucket: string,
    endpoint: string,
    accessKey: string,
    secretKey: string,
    region = 'us-east-1',
  ) {
    this.client = new S3Client({
      region,
      endpoint,
      forcePathStyle: true,
      credentials: {
        accessKeyId: accessKey,
        secretAccessKey: secretKey,
      },
    });
  }

  async ensureBucket(): Promise<void> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
      return;
    } catch (error) {
      const status = (error as { $metadata?: { httpStatusCode?: number } })
        ?.$metadata?.httpStatusCode;
      if (status !== 404) {
        throw error;
      }
    }
    await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
    this.logger.log(`Đã tạo bucket ${this.bucket}.`);
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        ContentLength: body.length,
      }),
    );
  }

  async get(key: string): Promise<StoredObject> {
    const result = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    const body = result.Body;
    if (!body || typeof body.transformToByteArray !== 'function') {
      throw new Error(`Object ${key} không có nội dung đọc được.`);
    }
    return {
      body: Buffer.from(await body.transformToByteArray()),
      contentType: result.ContentType ?? null,
    };
  }

  async delete(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );
  }
}

// Bản bộ nhớ dùng cho unit test và môi trường không cấu hình S3.
export class InMemoryObjectStorage implements ObjectStorage {
  private readonly objects = new Map<
    string,
    { body: Buffer; contentType: string }
  >();

  async ensureBucket(): Promise<void> {
    // Không cần làm gì.
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    this.objects.set(key, { body: Buffer.from(body), contentType });
  }

  async get(key: string): Promise<StoredObject> {
    const found = this.objects.get(key);
    if (!found) {
      throw new Error(`Không tìm thấy object ${key}.`);
    }
    return {
      body: Buffer.from(found.body),
      contentType: found.contentType,
    };
  }

  async delete(key: string): Promise<void> {
    this.objects.delete(key);
  }
}
