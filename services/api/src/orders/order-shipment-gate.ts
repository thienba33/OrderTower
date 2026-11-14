// SPDX-License-Identifier: Apache-2.0

// Cổng đọc trạng thái shipment cho rào chắn đơn. Phía đơn chỉ cần biết đơn
// có shipment ở trạng thái nào và có bằng chứng giao hàng hay không, không
// cần biết shipment lưu ở đâu hay service shipment làm gì. Nhờ vậy
// OrdersService không phụ thuộc ShipmentsService: cổng do phía shipment
// cài đặt (ShipmentGateAdapter, đọc qua ShipmentStore), phía đơn chỉ tiêm
// theo token và dùng tùy chọn. Khi cổng không có (service dựng bằng tay
// trong kiểm thử, không qua mô-đun), 2 chuyển có rào chắn bằng chứng
// shipment đều bị chặn, nghĩa là chặn khi thiếu bằng chứng chứ không cho
// qua khi không kiểm được.
export const ORDER_SHIPMENT_GATE = 'ORDER_SHIPMENT_GATE';

export interface OrderShipmentEvidence {
  status: string;
  proofPhotoKey: string | null;
}

export interface OrderShipmentGate {
  findByOrderId(orderId: string): Promise<OrderShipmentEvidence[]>;
}
