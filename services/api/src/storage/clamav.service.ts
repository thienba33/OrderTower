// SPDX-License-Identifier: Apache-2.0
import { Injectable, Logger } from '@nestjs/common';
import { createConnection, type Socket } from 'node:net';
import type { ClamScanResult } from './storage.types';

// Client tối giản cho clamd INSTREAM, không cần thêm dependency. Nếu
// CLAMAV_ENABLED=false thì trả clean kèm ghi chú để môi trường local không
// có clamd vẫn upload được; production/demo nên bật và đặt
// CLAMAV_REQUIRED=true để fail-closed khi clamd lỗi.
@Injectable()
export class ClamAvService {
  private readonly logger = new Logger(ClamAvService.name);
  private readonly enabled = process.env.CLAMAV_ENABLED === 'true';
  private readonly host = process.env.CLAMAV_HOST ?? 'clamav';
  private readonly port = Number(process.env.CLAMAV_PORT ?? 3310);
  private readonly timeoutMs = Number(process.env.CLAMAV_TIMEOUT_MS ?? 15000);

  async scan(buffer: Buffer): Promise<ClamScanResult> {
    if (!this.enabled) {
      return {
        status: 'clean',
        signature: null,
        note: 'CLAMAV_ENABLED=false, bỏ qua kiểm dịch',
      };
    }
    if (buffer.length === 0) {
      return { status: 'clean', signature: null, note: 'File rỗng' };
    }
    return new Promise<ClamScanResult>((resolve) => {
      let settled = false;
      let response = '';
      let socket: Socket;
      const finish = (result: ClamScanResult): void => {
        if (settled) {
          return;
        }
        settled = true;
        socket?.destroy();
        resolve(result);
      };
      try {
        socket = createConnection({ host: this.host, port: this.port });
      } catch (error) {
        resolve({
          status: 'error',
          signature: null,
          note: `Không tạo được kết nối clamd: ${
            error instanceof Error ? error.message : String(error)
          }`,
        });
        return;
      }
      socket.setTimeout(this.timeoutMs);
      socket.on('connect', () => {
        socket.write('zINSTREAM\0');
        const chunkSize = 64 * 1024;
        for (let offset = 0; offset < buffer.length; offset += chunkSize) {
          const chunk = buffer.subarray(offset, offset + chunkSize);
          const length = Buffer.alloc(4);
          length.writeUInt32BE(chunk.length, 0);
          socket.write(length);
          socket.write(chunk);
        }
        socket.write(Buffer.from([0, 0, 0, 0]));
      });
      socket.on('data', (chunk) => {
        response += chunk.toString('utf8');
      });
      socket.on('end', () => {
        const text = response.replace(/\0/g, '').trim();
        const clean = text.includes('OK');
        const infected = text.includes('FOUND');
        if (infected) {
          const signature = text
            .replace(/^stream:\s*/i, '')
            .replace(/\s+FOUND.*$/i, '')
            .trim();
          finish({
            status: 'infected',
            signature: signature || null,
            note: text,
          });
          return;
        }
        finish({
          status: clean ? 'clean' : 'error',
          signature: null,
          note: text || 'clamd không trả lời',
        });
      });
      socket.on('timeout', () => {
        finish({
          status: 'error',
          signature: null,
          note: `clamd quá thời gian ${this.timeoutMs}ms`,
        });
      });
      socket.on('error', (error) => {
        this.logger.warn(`clamd lỗi: ${error.message}`);
        finish({
          status: 'error',
          signature: null,
          note: `clamd lỗi: ${error.message}`,
        });
      });
    });
  }
}
