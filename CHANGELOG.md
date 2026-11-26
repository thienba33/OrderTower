<!-- SPDX-License-Identifier: Apache-2.0 -->
# Changelog

## [Unreleased]

## [0.1.0] - 2026-11-26

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
- Nối màn Telesale (PR #46): tab đơn ưu tiên từ API thật, lọc theo quy tắc SLA (hạn giao quá hoặc trong 24 giờ, độ tin cậy địa chỉ dưới 70).
- Tài liệu chuẩn bị Mốc 2 (PR #47): cập nhật CHANGELOG, tài liệu kiến trúc, SBOM cho web và runbook demo.
- Dockerfile cho web (PR #48): build web bằng Docker với `output: standalone`, thêm `KEYCLOAK_INTERNAL_URL` cho gọi nội bộ trong Compose.
- Menu theo vai trò (PR #50): sidebar lọc theo vai trò đăng nhập, chặn màn không có quyền, trang chủ chuyển tới màn đầu tiên được phép.
- Dữ liệu mẫu seed (PR #51): API tự seed khi kho trống, 5 xe, 5 tài xế, 3 kênh, 11 SKU và 8 đơn mẫu ở các trạng thái khác nhau.
- Chuyển thẳng tới đăng nhập khi chưa đăng nhập (PR #55): mọi trang chuyển tới Keycloak thay vì hiện khung trống.
- Panel hoàn hàng theo kênh ở màn Chăm sóc khách hàng (PR #59): tỷ lệ hoàn theo kênh và KPI hoàn đang chờ xử lý tính từ API thật, chỉ hiển thị.
- Đóng đơn bằng hoàn hàng đã duyệt (PR #60): chuyển Đã giao sang Hoàn chấp nhận `returnId`, hướng xử lý suy ra từ hoàn hàng, chỉ hoàn Đã duyệt hoặc Đã hoàn tiền mới dùng được, 245 test.
- Mục Trả hàng trên trang chi tiết đơn (PR #61): liệt kê, tạo, duyệt, từ chối và hoàn tiền theo vai trò; đóng đơn được chọn hoàn đã duyệt thay vì nhập tay.
- API phân công đơn và nhật ký cuộc gọi (PR #62): điều phối viên chia đơn telesale hoặc kho, nhân viên chăm sóc khách hàng ghi nhật ký cuộc gọi, tối đa 1 phân công đang mở mỗi loại trên mỗi đơn, 277 test.
- Gộp Telesale vào Chăm sóc khách hàng (PR #63): Telesale thành mục Cuộc gọi trong màn CSKH, dùng chung lịch sử liên hệ, bỏ mục Telesale khỏi menu, `/telesale` chuyển hướng sang `/customer-care`; điều phối viên được xem màn CSKH để chia đơn.
- API cờ hạn chế (PR #64): tạo cờ hoàn nhiều lần, đề xuất hạn chế, Quản lý và Quản trị viên duyệt hoặc từ chối, tối đa 1 cờ đang mở mỗi đơn; khách hạn chế suy ra từ cờ, không lưu cờ trên khách hàng, 306 test.
- Nối màn Danh sách hạn chế (PR #65): bảng cờ, KPI và dialog quyết định từ API thật, số điện thoại che một phần, tìm kiếm theo số đầy đủ.
- Nối màn Phân phối đơn (PR #66): bàn điều phối đóng gói 3 tab từ phân công kho và đơn hàng thật, cảnh báo vượt tải chuẩn 30 đơn, mục Việc của tôi ở màn Kho chỉ nhân viên kho thấy.
- API theo dõi công khai (PR #67): `GET /api/public/tracking?orderId=&phone=` không cần đăng nhập, sai mã đơn hay số điện thoại đều trả chung 404, không trả số điện thoại hay hash audit, 321 test.
- Nối màn Theo dõi đơn hàng sang endpoint công khai (PR #68): khách vãng lai tra cứu bằng mã đơn và số điện thoại, không cần đăng nhập; bỏ route tra cứu cũ cần đăng nhập.
- Cập nhật tài liệu tổng hợp đến commit `5abcf9f` (PR #69): cập nhật `CHANGELOG.md`, `docs/architecture.md` và ghi chú biến môi trường mẫu CI trong `.github/workflows/ci.yml`.
- Mở rộng dữ liệu mẫu Mốc 3 (PR #71): thêm `scripts/generate-sample-data.mjs` sinh xác định 40 SKU và 112 đơn lịch sử (`LS-1001`..`LS-1112`) trong 28 ngày kèm 13 đơn hoàn, nạp qua đường dịch vụ thật lúc khởi động để đạt 120 đơn mẫu (cùng 8 đơn demo `DH-1001`..`DH-1008`).
- Mô-đun BI pilot (`services/api/src/bi/`, migration `012_bi.sql`, PR #72): dự báo nhu cầu theo SKU và kênh từ dữ liệu đã giao, phát hiện 3 bất thường (tồn kho dưới 7 ngày, tỷ lệ hoàn kênh cao, cầu tăng đột biến), sinh đề xuất kèm đầu vào đối soát, duyệt/từ chối và ghi nhận phản hồi (`Quản lý`/`Quản trị viên`), tính và lưu snapshot `DX-Score v1` theo 4 trục H-P-D-I.
- Nối màn BI & DX-Score (`/bi-dx-score`, PR #73): hiển thị dự báo, bất thường, duyệt/từ chối đề xuất, ghi phản hồi kết quả và tính DX-Score từ API BI thật.
- API ticket chăm sóc khách hàng (`services/api/src/tickets/`, migration `013_tickets.sql`, PR #74): tạo và chuyển trạng thái xuôi 1 chiều (`Mới` -> `Đang xử lý` -> `Chờ khách` -> `Đã đóng`), tính 4 KPI trực tiếp từ DB và nạp 14 dòng mẫu đóng băng (`YC-018`..`YC-031`) khi bảng trống.
- Nối phần ticket và 4 KPI trạng thái trên màn Chăm sóc khách hàng (`/customer-care`, PR #75) với API ticket thật.
- Tổ chức mục Cuộc gọi trên màn Chăm sóc khách hàng thành 4 tab telesale theo trạng thái phân công và độ tin cậy địa chỉ (PR #76).
- Nối phần Lịch sử liên hệ trên màn Chăm sóc khách hàng với API nhật ký cuộc gọi thật (`/api/call-logs`, PR #77).
- Tách mục Cuộc gọi trên màn Chăm sóc khách hàng thành tab riêng trên giao diện CSKH (PR #81).
- Hiển thị nội dung màn Tổng quan (`/`) phù hợp theo từng vai trò đăng nhập (PR #82).
- Siết chặt phân quyền RBAC trên API (`RolesGuard`, `@Roles()`, `services/api/src/auth/permissions.ts`, PR #83) và giới hạn phạm vi dữ liệu tài xế chỉ xem đơn/shipment/sự kiện của chính mình.
- Dịch vụ dữ liệu phi cấu trúc Tầng 1 (`services/api/src/storage/`, migration `014_files.sql`, PR #86): upload/tải file qua SeaweedFS S3 (`@aws-sdk/client-s3`), kiểm dịch ClamAV qua `INSTREAM` (tùy chọn fail-closed với `CLAMAV_REQUIRED=true`), route proxy `/api/files` trên web và gắn ảnh bằng chứng giao hàng (`proofPhotoFileId`) ở màn tài xế.
- Hồ sơ phát hành `0.1.0`: cập nhật `sbom/api.cyclonedx.json` (491 thành phần) và `LICENSES.md` (bổ sung `@aws-sdk/client-s3` và `ClamAV`).

### Fixed

- Sửa header SPDX trong Dockerfile của web (PR #49): dùng `#` thay cho `//` để Docker đọc được.
- Sửa khởi động API (PR #52): đánh dấu pool kiểm thử của DbService là tùy chọn để Nest khởi động được ứng dụng.
- Ép file `.sh` về LF (PR #53): thêm `.gitattributes` để script khởi tạo Postgres không bị lỗi CRLF trên Windows.
- Sửa lỗi tràn số thứ tự audit (PR #54): ép kiểu BIGINT của Postgres về số trước khi cộng, kèm test hồi quy.
- Sửa chuyển hướng đăng nhập và đăng xuất (PR #56): callback dùng `APP_ORIGIN` thay cho `request.url`, đăng xuất dùng đúng URI đã đăng ký.
- Đọc vai trò từ access token (PR #58): Keycloak 26 không gắn vai trò vào ID token, web đọc vai trò từ access token, ID token chỉ làm dự phòng.
- Tách nội dung màn BI & DX-Score theo từng tab và bỏ badge phê duyệt viết cứng trên thanh điều hướng (PR #78).
- Đọc đúng mảng `rows` và `anomalies` từ object trả về của `/api/bi/forecast` và `/api/bi/anomalies` trên màn BI & DX-Score (PR #79).
- Phân trang các cột trong tab cần chú ý ở màn Phân phối đơn (`/distribution`, PR #80).
- Cho phép các route công khai `/api/health` và `/api/public/tracking` đi qua APISIX mà không bị chặn xác thực (PR #83).
