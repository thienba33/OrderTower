// SPDX-License-Identifier: Apache-2.0

// Hình API màn Phân tách địa chỉ dùng lại từ trang chi tiết đơn:
// đơn đầy đủ kèm địa chỉ, tin cậy và trạng thái. Kiểu PendingAddressRow
// và ConfirmAddressRow trong data/address-split.ts là dữ liệu mẫu đóng
// băng nên không dùng lại ở đây; trang này đọc API thật.

// Địa chỉ đã tách của 1 đơn, người dùng chọn tay từng cấp. Tỉnh/quận/
// phường chỉ nhận giá trị trong hằng số địa lý của data/address-split.ts
// (khớp gazetteer của API); cấp nào đơn chưa có thì để trống.
export interface RowSplit {
  province: string;
  district: string;
  ward: string;
  street: string;
}
