// SPDX-License-Identifier: Apache-2.0
import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Caller } from '../auth/auth.types';
import { InventoryService } from '../inventory/inventory.service';
import { OrdersService } from '../orders/orders.service';
import { ReturnsService } from '../returns/return.service';
import { ShipmentsService } from '../shipments/shipment.service';
import type { HistoricalOrderSeedItem } from './seed.types';

// Tên tệp seed mặc định. Đổi tệp seed rồi khởi động lại thì đơn lịch sử
// mới có hiệu lực.
const DEFAULT_SEED_FILE = 'historical-orders.seed.json';

// Người gọi lúc nạp seed lịch sử: tài khoản hệ thống "seed", giống seed
// demo. Chuyển đơn cần cả Điều phối viên và Nhân viên kho vì chuyển trạng
// thái kiểm vai theo định nghĩa; vai đầu là Quản trị viên nên audit ghi
// vai đó cho các bước chuyển đơn.
const SEED_CALLER: Caller = {
  userId: 'seed',
  username: 'seed',
  roles: ['Quản trị viên', 'Điều phối viên', 'Nhân viên kho'],
};

// Điều xe và hoàn tiền cần vai Điều phối viên; tạo trả hàng cần vai Nhân
// viên chăm sóc khách hàng; duyệt/từ chối trả hàng cần vai Quản lý.
const DISPATCHER_CALLER: Caller = {
  userId: 'seed',
  username: 'seed',
  roles: ['Điều phối viên'],
};
const CSKH_CALLER: Caller = {
  userId: 'seed',
  username: 'seed',
  roles: ['Nhân viên chăm sóc khách hàng'],
};
const MANAGER_CALLER: Caller = {
  userId: 'seed',
  username: 'seed',
  roles: ['Quản lý'],
};

// 5 tài xế và 5 xe mẫu, theo đúng thứ tự seed: TX-1001 tới TX-1005 gắn
// với username demo.driver, driver.hoa, driver.phuc, driver.dung,
// driver.thanh; xe XE-1001 tới XE-1005. Điều xe chọn cặp tài xế và xe
// còn sẵn sàng đầu tiên (quay từ vị trí lần trước) để không giữ trùng
// tài xế hay xe cho nhiều đơn cùng lúc; giao hàng hoặc giao thất bại
// trả tài xế và xe về sẵn sàng.
const DRIVERS = [
  { id: 'TX-1001', username: 'demo.driver' },
  { id: 'TX-1002', username: 'driver.hoa' },
  { id: 'TX-1003', username: 'driver.phuc' },
  { id: 'TX-1004', username: 'driver.dung' },
  { id: 'TX-1005', username: 'driver.thanh' },
];
const VEHICLES = ['XE-1001', 'XE-1002', 'XE-1003', 'XE-1004', 'XE-1005'];

// Lý do giao thất bại và lý do từ chối trả hàng dùng cho seed lịch sử.
const FAIL_REASON = 'Khách không nghe máy, hẹn giao lại.';
const REJECT_REASON = 'Không đủ điều kiện trả hàng.';

// Giờ lệch sau thời điểm tạo đơn cho từng bước của luồng lịch sử. Đơn
// càng về cuối luồng thì cần càng nhiều thời gian: giao hàng ở +31 giờ,
// đóng đơn không qua trả hàng ở +33 giờ, đóng đơn qua trả hàng ở +54 giờ
// (đã duyệt/từ chối) hoặc +58 giờ (đã hoàn tiền). Lệch lớn nhất 58 giờ
// nên script sinh dữ liệu giới hạn ngày tạo đơn theo trạng thái đích để
// không bước nào vượt quá 23/11/2026 00:00 UTC, mốc chạy seed.
const HOURS = {
  checked: 1,
  warehouse: 3,
  packing: 5,
  dispatchReady: 7,
  shipmentCreated: 7.5,
  dispatched: 26,
  failed: 30,
  delivered: 31,
  closed: 33,
  returnCreated: 49,
  returnDecided: 52,
  refunded: 56,
  closedWithReturn: 58,
  closedWithReturnEarly: 54,
  cancelledFromNew: 2,
  cancelledFromChecked: 4,
} as const;

function at(createdAt: string, hoursOffset: number): string {
  return new Date(
    Date.parse(createdAt) + hoursOffset * 60 * 60 * 1000,
  ).toISOString();
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

// Nạp 112 đơn lịch sử qua đường dịch vụ thật (create rồi transition hợp
// lệ, kèm shipment và trả hàng khi cần) sau khi 8 đơn demo đã nạp, để dữ
// liệu mẫu có đủ chiều thời gian cho lớp BI và DX-Score (mục 5 bản dự
// thảo BI pilot, mốc 3). Đơn lịch sử mang mã LS-1001 trở đi, tách khỏi
// dãy DH- của đơn demo và đơn tạo tay. Chạy 1 lần duy nhất: khởi động lại
// thì thấy đã có đơn LS- nên bỏ qua, không nạp trùng.
@Injectable()
export class HistoricalSeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(HistoricalSeedService.name);
  // Chỉ số tài xế và xe đang giữ cho đơn Đang giao (chưa giao xong nên
  // chưa trả về sẵn sàng); chọn cặp mới thì bỏ qua các chỉ số này.
  private busyDriverIndexes = new Set<number>();
  private nextDriverProbe = 0;
  private cancelFromNewUsed = false;

  constructor(
    private readonly orders: OrdersService,
    private readonly shipments: ShipmentsService,
    private readonly returns: ReturnsService,
    private readonly inventory: InventoryService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    // Đọc và kiểm tra seed trước: tệp seed sai vẫn chặn khởi động, dù đã
    // nạp rồi.
    const seed = this.loadSeed();
    const existing = await this.orders.list();
    if (existing.some((order) => order.id.startsWith('LS-'))) {
      this.logger.log(
        `Đã có đơn lịch sử trong DB, bỏ qua seed lịch sử (${seed.length} đơn trong tệp).`,
      );
      return;
    }
    // Nâng cấp DB cũ: kho chỉ có 11 SKU gốc thì đơn lịch sử nhắc SKU mới
    // sẽ rớt rào chắn tồn kho. Bỏ qua kèm cảnh báo thay vì ném lỗi, để
    // API cũ vẫn chạy; dữ liệu mốc 3 đầy đủ cần xóa DB rồi chạy lại
    // (xem src/seed/data/README.md).
    const stocked = new Set(
      (await this.inventory.list()).map((item) => item.sku),
    );
    const missing = new Set<string>();
    for (const item of seed) {
      for (const line of item.items) {
        if (!stocked.has(line.sku)) {
          missing.add(line.sku);
        }
      }
    }
    if (missing.size > 0) {
      this.logger.warn(
        `Bỏ qua seed lịch sử: kho thiếu SKU ${[...missing].sort().join(', ')}. Xóa DB rồi chạy lại để nạp đủ dữ liệu mốc 3.`,
      );
      return;
    }
    this.busyDriverIndexes = new Set<number>();
    this.nextDriverProbe = 0;
    this.cancelFromNewUsed = false;
    // Đơn đích là Đang giao nạp sau cùng (giữ nguyên thứ tự trong từng
    // nhóm): đơn đang giao giữ tài xế và xe tới cuối, nếu nạp xen giữa
    // thì 5 đơn này giữ hết 5 tài xế trước khi các đơn đã giao xong kịp
    // điều xe. Mã LS- vì vậy theo thứ tự nạp, không theo thứ tự tệp.
    const ordered = [
      ...seed.filter((item) => item.targetState !== 'Đang giao'),
      ...seed.filter((item) => item.targetState === 'Đang giao'),
    ];
    for (const item of ordered) {
      await this.seedOrder(item);
    }
    this.logger.log(`Đã nạp ${seed.length} đơn lịch sử từ tệp seed.`);
  }

  resolveSeedPath(): string {
    if (process.env.HISTORICAL_SEED_PATH) {
      return process.env.HISTORICAL_SEED_PATH;
    }
    return join(__dirname, 'data', DEFAULT_SEED_FILE);
  }

  private loadSeed(): HistoricalOrderSeedItem[] {
    const path = this.resolveSeedPath();
    let raw: string;
    try {
      raw = readFileSync(path, 'utf-8');
    } catch (error) {
      throw new Error(
        `Không đọc được tệp seed đơn lịch sử tại ${path}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw) as unknown;
    } catch {
      throw new Error(
        `Tệp seed đơn lịch sử tại ${path} không phải JSON hợp lệ.`,
      );
    }
    if (typeof parsed !== 'object' || parsed === null) {
      throw new Error(
        `Tệp seed đơn lịch sử tại ${path} không hợp lệ: nội dung phải là 1 object JSON.`,
      );
    }
    const items = (parsed as { items?: unknown }).items;
    if (!Array.isArray(items) || items.length === 0) {
      throw new Error(
        `Tệp seed đơn lịch sử tại ${path} không hợp lệ: items phải là mảng không rỗng.`,
      );
    }
    const states = new Set([
      'Mới tạo',
      'Đã kiểm tra',
      'Chờ kho',
      'Đang đóng gói',
      'Chờ điều xe',
      'Đang giao',
      'Đã giao',
      'Hoàn',
      'Hủy',
    ]);
    const seenKeys = new Set<string>();
    for (const entry of items) {
      if (typeof entry !== 'object' || entry === null) {
        throw new Error(
          `Tệp seed đơn lịch sử tại ${path} không hợp lệ: mỗi item phải là 1 object.`,
        );
      }
      const item = entry as Record<string, unknown>;
      if (!isNonEmptyString(item.idempotencyKey)) {
        throw new Error(
          `Tệp seed đơn lịch sử tại ${path} không hợp lệ: mỗi item cần idempotencyKey dạng chuỗi.`,
        );
      }
      if (!isNonEmptyString(item.customer)) {
        throw new Error(
          `Tệp seed đơn lịch sử tại ${path} không hợp lệ: mỗi item cần customer dạng chuỗi.`,
        );
      }
      if (!Array.isArray(item.items) || item.items.length === 0) {
        throw new Error(
          `Tệp seed đơn lịch sử tại ${path} không hợp lệ: items của ${String(item.idempotencyKey)} phải là mảng không rỗng.`,
        );
      }
      for (const line of item.items as unknown[]) {
        if (typeof line !== 'object' || line === null) {
          throw new Error(
            `Tệp seed đơn lịch sử tại ${path} không hợp lệ: mỗi mặt hàng của ${String(item.idempotencyKey)} phải là 1 object.`,
          );
        }
        const row = line as Record<string, unknown>;
        if (!isNonEmptyString(row.sku)) {
          throw new Error(
            `Tệp seed đơn lịch sử tại ${path} không hợp lệ: mỗi mặt hàng của ${String(item.idempotencyKey)} cần sku dạng chuỗi.`,
          );
        }
        if (
          typeof row.quantity !== 'number' ||
          !Number.isInteger(row.quantity) ||
          row.quantity <= 0
        ) {
          throw new Error(
            `Tệp seed đơn lịch sử tại ${path} không hợp lệ: quantity của ${String(row.sku)} trong ${String(item.idempotencyKey)} phải là số nguyên dương.`,
          );
        }
      }
      if (
        item.channelId !== undefined &&
        !isNonEmptyString(item.channelId)
      ) {
        throw new Error(
          `Tệp seed đơn lịch sử tại ${path} không hợp lệ: channelId của ${String(item.idempotencyKey)} phải là dạng chuỗi khi có.`,
        );
      }
      if (item.address !== undefined) {
        if (typeof item.address !== 'object' || item.address === null) {
          throw new Error(
            `Tệp seed đơn lịch sử tại ${path} không hợp lệ: address của ${String(item.idempotencyKey)} phải là 1 object khi có.`,
          );
        }
        for (const field of ['province', 'district', 'ward', 'street'] as const) {
          const value = (item.address as Record<string, unknown>)[field];
          if (value !== undefined && typeof value !== 'string') {
            throw new Error(
              `Tệp seed đơn lịch sử tại ${path} không hợp lệ: address.${field} của ${String(item.idempotencyKey)} phải là dạng chuỗi khi có.`,
            );
          }
        }
      }
      if (
        !isNonEmptyString(item.createdAt) ||
        Number.isNaN(Date.parse(item.createdAt as string))
      ) {
        throw new Error(
          `Tệp seed đơn lịch sử tại ${path} không hợp lệ: ${String(item.idempotencyKey)} cần createdAt dạng ngày ISO.`,
        );
      }
      if (!isNonEmptyString(item.targetState) || !states.has(item.targetState as string)) {
        throw new Error(
          `Tệp seed đơn lịch sử tại ${path} không hợp lệ: targetState của ${String(item.idempotencyKey)} phải là 1 trong 9 trạng thái.`,
        );
      }
      if (item.targetState === 'Hủy' && !isNonEmptyString(item.cancelReason)) {
        throw new Error(
          `Tệp seed đơn lịch sử tại ${path} không hợp lệ: ${String(item.idempotencyKey)} đích là Hủy thì cần cancelReason.`,
        );
      }
      if (
        item.targetState === 'Hoàn' &&
        item.return === undefined &&
        !isNonEmptyString(item.closeHandling)
      ) {
        throw new Error(
          `Tệp seed đơn lịch sử tại ${path} không hợp lệ: ${String(item.idempotencyKey)} đích là Hoàn mà không có trả hàng thì cần closeHandling.`,
        );
      }
      if (item.failOnce === true && item.targetState !== 'Chờ điều xe') {
        throw new Error(
          `Tệp seed đơn lịch sử tại ${path} không hợp lệ: failOnce của ${String(item.idempotencyKey)} chỉ dùng cho đơn đích là Chờ điều xe.`,
        );
      }
      if (item.return !== undefined) {
        if (typeof item.return !== 'object' || item.return === null) {
          throw new Error(
            `Tệp seed đơn lịch sử tại ${path} không hợp lệ: return của ${String(item.idempotencyKey)} phải là 1 object khi có.`,
          );
        }
        const ret = item.return as Record<string, unknown>;
        if (!isNonEmptyString(ret.reason)) {
          throw new Error(
            `Tệp seed đơn lịch sử tại ${path} không hợp lệ: return của ${String(item.idempotencyKey)} cần reason dạng chuỗi.`,
          );
        }
        if (
          ret.outcome !== 'pending' &&
          ret.outcome !== 'approved' &&
          ret.outcome !== 'refunded' &&
          ret.outcome !== 'rejected'
        ) {
          throw new Error(
            `Tệp seed đơn lịch sử tại ${path} không hợp lệ: return.outcome của ${String(item.idempotencyKey)} phải là pending, approved, refunded hoặc rejected.`,
          );
        }
        if (
          ret.outcome === 'pending' &&
          item.targetState !== 'Đã giao'
        ) {
          throw new Error(
            `Tệp seed đơn lịch sử tại ${path} không hợp lệ: trả hàng chờ xử lý của ${String(item.idempotencyKey)} chỉ gắn cho đơn còn ở Đã giao.`,
          );
        }
        if (
          item.targetState === 'Đã giao' &&
          ret.outcome !== 'pending'
        ) {
          throw new Error(
            `Tệp seed đơn lịch sử tại ${path} không hợp lệ: trả hàng của ${String(item.idempotencyKey)} gắn cho đơn còn ở Đã giao thì phải chờ xử lý, không quyết định rồi mới đóng đơn.`,
          );
        }
      }
      if (seenKeys.has(item.idempotencyKey as string)) {
        throw new Error(
          `Tệp seed đơn lịch sử tại ${path} không hợp lệ: idempotencyKey ${String(item.idempotencyKey)} bị trùng.`,
        );
      }
      seenKeys.add(item.idempotencyKey as string);
    }
    return items as HistoricalOrderSeedItem[];
  }

  private async seedOrder(item: HistoricalOrderSeedItem): Promise<void> {
    const created = await this.orders.create(
      {
        idempotencyKey: item.idempotencyKey,
        customer: item.customer,
        ...(item.phone !== undefined ? { phone: item.phone } : {}),
        items: item.items,
        ...(item.channelId !== undefined
          ? { channelId: item.channelId }
          : {}),
        ...(item.address !== undefined ? { address: item.address } : {}),
        ...(item.deadline !== undefined ? { deadline: item.deadline } : {}),
      },
      SEED_CALLER,
      { at: item.createdAt, idPrefix: 'LS' },
    );
    const orderId = created.id;
    const move = async (
      to: string,
      hours: number,
      extra?: { reason?: string; handling?: string; returnId?: string },
    ): Promise<void> => {
      await this.orders.transition(
        orderId,
        { to, ...extra },
        SEED_CALLER,
        { at: at(item.createdAt, hours) },
      );
    };
    switch (item.targetState) {
      case 'Mới tạo':
        break;
      case 'Đã kiểm tra':
        await move('Đã kiểm tra', HOURS.checked);
        break;
      case 'Chờ kho':
        await move('Đã kiểm tra', HOURS.checked);
        await move('Chờ kho', HOURS.warehouse);
        break;
      case 'Đang đóng gói':
        await move('Đã kiểm tra', HOURS.checked);
        await move('Chờ kho', HOURS.warehouse);
        await move('Đang đóng gói', HOURS.packing);
        break;
      case 'Chờ điều xe': {
        await move('Đã kiểm tra', HOURS.checked);
        await move('Chờ kho', HOURS.warehouse);
        await move('Đang đóng gói', HOURS.packing);
        await move('Chờ điều xe', HOURS.dispatchReady);
        if (item.failOnce === true) {
          const dispatched = await this.dispatchOrder(orderId, item.createdAt);
          await this.shipments.fail(
            dispatched.shipmentId,
            { reason: FAIL_REASON },
            driverCaller(dispatched.driverUsername),
            { at: at(item.createdAt, HOURS.failed) },
          );
          this.busyDriverIndexes.delete(dispatched.driverIndex);
        }
        break;
      }
      case 'Đang giao': {
        await move('Đã kiểm tra', HOURS.checked);
        await move('Chờ kho', HOURS.warehouse);
        await move('Đang đóng gói', HOURS.packing);
        await move('Chờ điều xe', HOURS.dispatchReady);
        await this.dispatchOrder(orderId, item.createdAt);
        break;
      }
      case 'Đã giao': {
        await move('Đã kiểm tra', HOURS.checked);
        await move('Chờ kho', HOURS.warehouse);
        await move('Đang đóng gói', HOURS.packing);
        await move('Chờ điều xe', HOURS.dispatchReady);
        const dispatched = await this.dispatchOrder(orderId, item.createdAt);
        await this.deliverOrder(orderId, dispatched, item.createdAt);
        // Trả hàng chờ xử lý gắn cho đơn còn ở Đã giao, không đóng đơn.
        if (item.return !== undefined) {
          await this.returns.create(
            { orderId, reason: item.return.reason },
            CSKH_CALLER,
            { at: at(item.createdAt, HOURS.returnCreated) },
          );
        }
        break;
      }
      case 'Hoàn': {
        await move('Đã kiểm tra', HOURS.checked);
        await move('Chờ kho', HOURS.warehouse);
        await move('Đang đóng gói', HOURS.packing);
        await move('Chờ điều xe', HOURS.dispatchReady);
        const dispatched = await this.dispatchOrder(orderId, item.createdAt);
        await this.deliverOrder(orderId, dispatched, item.createdAt);
        if (item.return !== undefined) {
          const close = await this.handleReturn(orderId, item);
          await move('Hoàn', close.hours, {
            ...(close.returnId !== undefined
              ? { returnId: close.returnId }
              : {}),
            ...(close.handling !== undefined
              ? { handling: close.handling }
              : {}),
          });
        } else {
          await move('Hoàn', HOURS.closed, {
            handling: item.closeHandling,
          });
        }
        break;
      }
      case 'Hủy': {
        // Đơn hủy đầu tiên hủy ngay từ Mới tạo, các đơn sau hủy từ Đã
        // kiểm tra, để cả 2 đường hủy trong định nghĩa đều có mẫu.
        if (!this.cancelFromNewUsed) {
          this.cancelFromNewUsed = true;
          await move('Hủy', HOURS.cancelledFromNew, {
            reason: item.cancelReason,
          });
        } else {
          await move('Đã kiểm tra', HOURS.checked);
          await move('Hủy', HOURS.cancelledFromChecked, {
            reason: item.cancelReason,
          });
        }
        break;
      }
    }
  }

  // Điều xe 1 đơn: tạo shipment lúc +7,5 giờ rồi điều xe lúc +26 giờ,
  // chọn cặp tài xế và xe còn sẵn sàng đầu tiên. Trả về shipment, tài xế
  // và chỉ số tài xế để bước giao hàng hoặc giao thất bại trả cặp đó về
  // sẵn sàng; đơn đích là Đang giao thì giữ nguyên, không trả.
  private async dispatchOrder(
    orderId: string,
    createdAt: string,
  ): Promise<{
    shipmentId: string;
    driverUsername: string;
    driverIndex: number;
  }> {
    let driverIndex = -1;
    for (let step = 0; step < DRIVERS.length; step += 1) {
      const candidate = (this.nextDriverProbe + step) % DRIVERS.length;
      if (!this.busyDriverIndexes.has(candidate)) {
        driverIndex = candidate;
        break;
      }
    }
    if (driverIndex === -1) {
      throw new Error(
        `Không còn tài xế sẵn sàng để điều xe cho đơn lịch sử ${orderId}.`,
      );
    }
    this.busyDriverIndexes.add(driverIndex);
    this.nextDriverProbe = (driverIndex + 1) % DRIVERS.length;
    const driver = DRIVERS[driverIndex];
    const vehicleId = VEHICLES[driverIndex];
    const shipment = await this.shipments.create(
      { orderId },
      DISPATCHER_CALLER,
      { at: at(createdAt, HOURS.shipmentCreated) },
    );
    await this.shipments.dispatch(
      shipment.id,
      { driverId: driver.id, vehicleId },
      DISPATCHER_CALLER,
      { at: at(createdAt, HOURS.dispatched) },
    );
    return {
      shipmentId: shipment.id,
      driverUsername: driver.username,
      driverIndex,
    };
  }

  private async deliverOrder(
    orderId: string,
    dispatched: {
      shipmentId: string;
      driverUsername: string;
      driverIndex: number;
    },
    createdAt: string,
  ): Promise<void> {
    await this.shipments.deliver(
      dispatched.shipmentId,
      { proofPhotoKey: `chung-tu/${orderId}/anh-giao.jpg` },
      driverCaller(dispatched.driverUsername),
      { at: at(createdAt, HOURS.delivered) },
    );
    this.busyDriverIndexes.delete(dispatched.driverIndex);
  }

  // Trả hàng tạo lúc +49 giờ khi đơn đang ở Đã giao, quyết định lúc +52
  // giờ, hoàn tiền lúc +56 giờ (nếu có). Trả về cách đóng đơn: dùng
  // returnId khi trả hàng đã duyệt hoặc đã hoàn tiền, hướng xử lý tự gõ
  // khi trả hàng đã từ chối. Trả hàng chờ xử lý thì không đóng đơn.
  private async handleReturn(
    orderId: string,
    item: HistoricalOrderSeedItem,
  ): Promise<{ hours: number; returnId?: string; handling?: string }> {
    const outcome = item.return?.outcome;
    const ret = await this.returns.create(
      { orderId, reason: item.return?.reason ?? '' },
      CSKH_CALLER,
      { at: at(item.createdAt, HOURS.returnCreated) },
    );
    if (outcome === 'approved') {
      await this.returns.approve(ret.id, MANAGER_CALLER, {
        at: at(item.createdAt, HOURS.returnDecided),
      });
      return { hours: HOURS.closedWithReturnEarly, returnId: ret.id };
    }
    if (outcome === 'refunded') {
      await this.returns.approve(ret.id, MANAGER_CALLER, {
        at: at(item.createdAt, HOURS.returnDecided),
      });
      await this.returns.refund(ret.id, DISPATCHER_CALLER, {
        at: at(item.createdAt, HOURS.refunded),
      });
      return { hours: HOURS.closedWithReturn, returnId: ret.id };
    }
    if (outcome === 'rejected') {
      await this.returns.reject(
        ret.id,
        { reason: REJECT_REASON },
        MANAGER_CALLER,
        { at: at(item.createdAt, HOURS.returnDecided) },
      );
      return {
        hours: HOURS.closedWithReturnEarly,
        handling: `Trả hàng ${ret.id} đã từ chối: ${REJECT_REASON}`,
      };
    }
    // Trả hàng chờ xử lý không đóng đơn; loadSeed đã chặn trường hợp này
    // cho đơn đích là Hoàn nên không tới được đây.
    throw new Error(
      `Trả hàng ${ret.id} của đơn ${orderId} chưa quyết định, không đóng đơn được.`,
    );
  }
}

function driverCaller(username: string): Caller {
  return { userId: username, username, roles: ['Tài xế'] };
}
