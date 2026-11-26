// SPDX-License-Identifier: Apache-2.0

export interface InventorySeedItem {
  sku: string;
  name: string;
  unit: string;
  stock: number;
  // Đơn giá bán (VND). Vắng hoặc null nghĩa là SKU chưa biết giá: đơn có
  // SKU này đóng góp 0 vào tổng tiền.
  unitPrice?: number | null;
}

export interface InventoryItem {
  sku: string;
  name: string;
  unit: string;
  // Đơn giá bán (VND), null khi SKU chưa biết giá.
  unitPrice: number | null;
  // Số lượng khả dụng (chưa giữ cho đơn nào).
  stock: number;
  // Số lượng đã giữ cho các đơn đang đi qua luồng.
  reserved: number;
}

export interface StockShortage {
  sku: string;
  needed: number;
  // null khi SKU không có trong kho.
  available: number | null;
  reason: string;
}

export interface StockCheck {
  sufficient: boolean;
  lacking: StockShortage[];
}
