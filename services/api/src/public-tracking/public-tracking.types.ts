// SPDX-License-Identifier: Apache-2.0
import type { AddressInput } from '../address/address.types';

// 1 dòng hàng trả cho khách vãng lai: mã SKU, số lượng, tên sản phẩm và
// đơn giá tra từ kho; tên và đơn giá null khi SKU không có trong kho
// hoặc chưa có giá, không bao giờ tự đặt tên hay tự đặt giá.
export interface PublicTrackingOrderItem {
  sku: string;
  quantity: number;
  name: string | null;
  unitPrice: number | null;
}

// Phần đơn trả cho khách vãng lai: chỉ những gì màn Theo dõi đơn hàng cần
// để vẽ tiến trình, hàng hóa và giao hàng. Không bao giờ mang SĐT, tên
// khách, mã khách, khóa idempotency hay id workflow. Địa chỉ giao hàng có
// trong trả về vì khách đã chứng minh là chủ đơn bằng SĐT lúc đặt đơn;
// mức tin cậy địa chỉ thì không trả vì đó là đánh giá nội bộ.
export interface PublicTrackingOrder {
  id: string;
  state: string;
  items: PublicTrackingOrderItem[];
  total: number;
  deadline: string | null;
  createdAt: string;
  channelId: string | null;
  address: AddressInput | null;
}

// 1 mốc trạng thái của đơn: trạng thái mới và thời điểm chuyển tới đó.
export interface PublicTrackingTimelineEntry {
  state: string;
  at: string;
}

// Shipment mới nhất của đơn, tên tài xế và biển số xe đã tra sẵn; null khi
// đơn chưa có shipment nào.
export interface PublicTrackingShipment {
  id: string;
  state: string;
  driverName: string | null;
  vehiclePlate: string | null;
}

// 1 sự kiện trong nhật ký giao hàng, chỉ loại, ghi chú và thời điểm; tên
// người ghi và vai không trả ra ngoài.
export interface PublicTrackingDeliveryEvent {
  type: string;
  note: string | null;
  createdAt: string;
}

export interface PublicTrackingResult {
  order: PublicTrackingOrder;
  timeline: PublicTrackingTimelineEntry[];
  shipment: PublicTrackingShipment | null;
  deliveryEvents: PublicTrackingDeliveryEvent[];
  proofPhotoKey: string | null;
}
