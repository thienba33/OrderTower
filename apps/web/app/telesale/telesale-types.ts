// SPDX-License-Identifier: Apache-2.0

// Một dòng trong danh sách đơn nên ưu tiên gọi, tính sẵn ở server từ API
// thật (đơn + kênh + tồn kho). ETA tính từ mốc giao hẹn trừ thời điểm tải
// trang, không phải mốc 07:30 như dữ liệu mẫu đóng băng.
export interface PriorityRow {
  id: string;
  channel: string;
  customer: string;
  phone: string;
  // Mốc giao hẹn dạng "DD/MM HH:mm" giờ Việt Nam, "-" khi đơn không có.
  deadline: string;
  // Sản phẩm dạng "Tên xN" nối nhau, tên lấy từ tồn kho, SKU khi chưa biết tên.
  product: string;
  // "Quá hạn" khi mốc giao đã qua, "XhYY" khi còn hạn, "-" khi không có mốc.
  eta: string;
  // Số phút còn lại tới mốc giao hẹn, -1 khi đã quá hạn, null khi không có mốc.
  // Dùng để sắp xếp theo ETA (quá hạn lên trước, không mốc xuống cuối).
  etaMinutes: number | null;
  suggestion: string;
  reason: string;
}
