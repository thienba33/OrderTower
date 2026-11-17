// SPDX-License-Identifier: Apache-2.0

// Hình API của trả hàng/đơn/kênh, chỉ lấy trường màn Chăm sóc khách
// hàng dùng. Kiểu ReturnChannelRow trong data/cskh.ts là dữ liệu mẫu
// đóng băng nên không dùng lại ở đây; panel hoàn hàng theo kênh đọc
// API thật, không import RETURN_CHANNELS nữa.

export type ApiReturnStatus =
  | "Chờ xử lý"
  | "Đã duyệt"
  | "Đã từ chối"
  | "Đã hoàn tiền";

export interface ApiReturn {
  id: string;
  orderId: string;
  status: ApiReturnStatus;
}

export interface ApiOrder {
  id: string;
  channelId: string | null;
}

export interface ApiChannel {
  id: string;
  name: string;
}

// Hoàn hàng của 1 kênh, tính từ API: số đơn của kênh, số trả hàng của
// các đơn đó, tỷ lệ làm tròn phần trăm.
export interface ReturnChannelStat {
  channel: string;
  returns: number;
  orders: number;
  percent: number;
}

// Lỗi tải dữ liệu hoàn hàng: hết phiên thì hiện link đăng nhập lại,
// lỗi khác thì báo tải lại trang. null là tải được.
export type ReturnsError = "unauthorized" | "load-failed";
