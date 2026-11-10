<!-- SPDX-License-Identifier: Apache-2.0 -->
# Mô-đun phê duyệt

Phê duyệt là việc con người phải quyết, ghi thành thực thể riêng để kiểm
chứng được: ai xin, ai duyệt, khi nào, lý do gì, đã dùng chưa.

- `request`: mở yêu cầu phê duyệt cho 1 việc (`type`) trên 1 thực thể
  (`subjectId`), bắt buộc có lý do. Ví dụ `order.edit.closed` là sửa đơn
  đã đóng; các điểm duyệt bắt buộc khác trong kế hoạch (sửa địa chỉ mức tin
  cậy thấp, đưa khách vào danh sách hạn chế, phân đơn vượt tải, điều tiết
  bán hàng và nhập hàng, áp dụng đề xuất AI) dùng chung thực thể này với
  `type` riêng.
- `approve` / `reject`: chỉ Quản lý và Quản trị viên duyệt; người xin không
  được tự duyệt yêu cầu của mình; từ chối bắt buộc có lý do.
- `markApplied`: đánh dấu phê duyệt đã duyệt là đã dùng, 1 phê duyệt chỉ
  dùng 1 lần. Đơn nghiệp vụ gọi bước này sau khi kiểm tra `type` và
  `subjectId` khớp với việc của mình.
- Mọi sự kiện đều ghi audit với người thật lấy từ token Keycloak.
- Kho phê duyệt nằm sau interface `ApprovalStore`, hiện là bản bộ nhớ,
  commit lưu bền sẽ thay bằng Postgres mà service phía trên không đổi.
