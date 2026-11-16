<!-- SPDX-License-Identifier: Apache-2.0 -->
# Changelog

Định dạng theo Keep a Changelog, phiên bản theo SemVer.

## [Unreleased]

### Added

- Khung khởi tạo của repo: cấu trúc thư mục, hồ sơ giấy phép, cấu hình hạ tầng, CI và dữ liệu mẫu.
- Luồng đơn tối thiểu và Workflow engine tách riêng khỏi API nghiệp vụ (PR #18): engine đọc định nghĩa luồng từ tệp JSON có phiên bản, 9 trạng thái và 10 chuyển trạng thái; audit log nối chuỗi hash SHA-256 có endpoint kiểm chứng; rào chắn tồn kho, độ tin cậy địa chỉ và hướng xử lý.
- Hạ tầng dữ liệu nền tảng (PR #19): Postgres 16 trong Compose, script khởi tạo tạo role `ordertower_app` và cơ sở dữ liệu `ordertower`.
- Củng cố Workflow engine (PR #20): thực thể WorkflowInstance với vòng đời riêng (tạm dừng, tiếp tục, kết thúc); xác thực JWT Keycloak qua JWKS và phân quyền theo vai trò; luồng phê duyệt cho sửa đơn đã đóng, người xin không tự duyệt, chỉ Quản lý và Quản trị viên duyệt, từ chối bắt buộc có lý do, 1 phê duyệt chỉ dùng 1 lần.
- Lưu bền Postgres (PR #21): đơn hàng, workflow instance, audit, phê duyệt và tồn kho lưu vào Postgres qua migration 001; khởi động lại API vẫn còn dữ liệu, đơn mới nối số đúng.
- Mô đun Shipment (PR #22): vòng đời shipment 5 trạng thái (Chờ điều xe, Đang giao, Đã giao, Giao thất bại, Đã hủy), điều xe kèm tài xế và xe, bằng chứng giao hàng bằng ảnh, lưu bền qua migration 002.
- Hồ sơ phát hành và SBOM (PR #23): `sbom/api.cyclonedx.json` (456 thành phần) và `sbom/web.cyclonedx.json` (358 thành phần) sinh từ lockfile bằng @cyclonedx/cyclonedx-npm; cập nhật LICENSES.md.
- Nối shipment vào chuyển trạng thái đơn (PR #24): điều xe, giao hàng và báo thất bại đi qua đúng luồng chuyển trạng thái của đơn; chuyển trực tiếp bị rào chắn chặn khi thiếu bằng chứng đã điều xe hoặc ảnh giao hàng.
- Mô đun Vehicle (PR #25): xe có biển số duy nhất, 3 trạng thái (Sẵn sàng, Đang giao, Bảo trì), điều xe chỉ dùng xe Sẵn sàng, lưu bền qua migration 003, 122 test.
- Mô đun Driver (PR #26): tài xế có số điện thoại và tên đăng nhập duy nhất, 3 trạng thái (Sẵn sàng, Đang giao, Tạm nghỉ); tài xế chỉ được giao hoặc báo thất bại shipment của chính mình, lưu bền qua migration 004, 144 test.
- Mô đun DeliveryEvent (PR #27): nhật ký giao hàng chỉ thêm không sửa, sự kiện tự động khi điều xe, giao hàng và báo thất bại, lưu bền qua migration 005, 160 test.
- Mô đun Channel (PR #28): kênh Chat, Web và Điện thoại có sẵn, tên kênh duy nhất, đơn hàng kiểm tra channelId tồn tại, lưu bền qua migration 006, 179 test.
- Mô đun Return (PR #29): hoàn hàng chỉ tạo khi đơn đã giao và chỉ có 1 hoàn đang mở mỗi đơn; duyệt hoặc từ chối chỉ Quản lý và Quản trị viên, hoàn tiền chỉ Điều phối viên, lưu bền qua migration 007, 197 test.
- Mô đun Customer (PR #30): khách hàng có số điện thoại duy nhất, đơn hàng kiểm tra customerId tồn tại, lưu bền qua migration 008, 213 test.
- Đăng nhập Keycloak cho web (PR #31): nút đăng nhập chuyển tới Keycloak theo PKCE S256, token chỉ nằm trong cookie httpOnly, toàn bộ mã xác thực ở phía server, web gọi API qua APISIX.
- Trường bổ sung của đơn (PR #32): số điện thoại, mốc giao hẹn và tổng tiền do server tính; giá đơn vị theo SKU trong kho, lưu bền qua migration 009, 224 test.
- Nối màn Danh sách đơn (PR #34): danh sách và tạo đơn từ API thật, bỏ chọn nhiều vì API không cho đổi trạng thái trực tiếp.
- Nối màn Chi tiết đơn (PR #35): chuyển trạng thái theo định nghĩa luồng và vai trò, nhập lý do và hướng xử lý khi rào chắn yêu cầu, hash audit thật.
- Nối thao tác giao hàng (PR #37): tạo shipment, điều xe, giao hàng, báo thất bại và hủy ngay trên trang chi tiết đơn; bằng chứng giao hàng nhập bằng mã khóa ảnh.
- Nối màn Hàng đợi duyệt (PR #38): duyệt và từ chối phê duyệt thật theo tab trạng thái, bỏ cột mức độ.
- Nối màn Theo dõi đơn hàng (PR #39): tra cứu đơn thật, timeline từ lịch sử đơn, nhật ký giao hàng, tài xế và biển số thật; màn này yêu cầu đăng nhập.
- Nối màn Tài xế (PR #40): danh sách và chi tiết theo tài xế đăng nhập, giao hàng và báo thất bại thật; bỏ nút bắt đầu giao và nút chụp ảnh.
- Nối màn Tổng quan (PR #41): KPI, luồng 9 trạng thái, hàng đợi duyệt, rào chắn và bảng SLA đều tính từ API thật; bỏ 2 section BI và DX-Score vì chưa có API.
- Nối màn Kho (PR #42): bảng tồn kho theo SKU thật, trạng thái hiển thị theo ngưỡng 100; bỏ lô, hạn dùng, hàng đang về và đề xuất nhập.
- Nối màn Phân tách địa chỉ (PR #43): tab chờ tách và xác nhận từ API thật, sửa địa chỉ tính lại độ tin cậy, bỏ số tin cậy 78 và 62 viết cứng.
- Nối màn Quản trị (PR #44): bảng audit thật với hash đủ 64 ký tự, dòng xác minh chuỗi hash và bảng định nghĩa luồng; bỏ section người dùng và cài đặt vì không có API.
