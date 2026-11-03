<!-- SPDX-License-Identifier: Apache-2.0 -->
# Mô-đun Workflow

Định nghĩa luồng nằm trong tệp JSON có phiên bản ở `definitions/`. Quy tắc:

- Phiên bản mới là tệp mới (`order-flow.v2.json`), không sửa tệp đã phát hành.
- Engine đọc tệp định nghĩa để quyết định chuyển trạng thái được phép, ghi
  lịch sử từng bước, lưu người duyệt, cho quay lui có kiểm soát và từ chối
  chuyển trạng thái trái phép kèm lý do.
- Mọi chuyển trạng thái đều ghi audit log chỉ ghi thêm kèm hash nối chuỗi.

Bài kiểm tra nghiệm thu: đổi tệp định nghĩa, khởi động lại engine, luồng mới
chạy được mà không sửa code API; thử chuyển trạng thái trái phép và phải bị
từ chối kèm log.
