// SPDX-License-Identifier: Apache-2.0

// parquetjs-lite không có type declaration chính thức. Khai báo tối thiểu
// cho các API mà module archive dùng: schema, writer file, reader file.
declare module 'parquetjs-lite' {
  export type ParquetFieldType = 'UTF8' | 'INT32' | 'INT64' | 'DOUBLE';

  export interface ParquetField {
    type: ParquetFieldType;
    optional?: boolean;
  }

  export class ParquetSchema {
    constructor(schema: Record<string, ParquetField>);
  }

  export class ParquetWriter {
    static openFile(
      schema: ParquetSchema,
      path: string,
    ): Promise<ParquetWriter>;
    appendRow(row: Record<string, unknown>): Promise<void>;
    close(): Promise<void>;
  }

  export interface ParquetCursor {
    next(): Promise<Record<string, unknown> | null>;
  }

  export class ParquetReader {
    static openFile(path: string): Promise<ParquetReader>;
    getCursor(): ParquetCursor;
    close(): Promise<void>;
  }
}
