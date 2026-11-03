<!-- SPDX-License-Identifier: Apache-2.0 -->
# Đóng góp

## Quy trình làm việc

Quy trình này là bắt buộc: lịch sử repo là một phần của tiêu chí chấm điểm
PoF, mọi thay đổi phải truy vết được từ Issue tới commit.

1. Mỗi việc là 1 Issue trên GitHub Issues, gắn milestone theo mốc 1, 2, 3, 4.
2. Mỗi Issue là 1 branch riêng, đặt tên `feat/ten-viec`, ví dụ
   `feat/web-order-kanban`. Không code trực tiếp trên `main`.
3. Mở Pull Request, ghi `Closes #so-issue`, mô tả luồng đã tự kiểm tra.
4. Một thành viên khác review rồi mới merge. Người viết PR không tự duyệt
   PR của mình. `main` được bảo vệ: cấm push trực tiếp, cấm force-push,
   bắt buộc CI xanh mới được merge.
5. Không bao giờ viết lại lịch sử trên `main`. Lỡ sai thì sửa bằng commit mới.

## Commit

- Nhỏ, 1 commit 1 việc, message tiếng Anh theo dạng
  `feat(web): add order kanban board`.
- Mỗi thành viên commit bằng tài khoản GitHub của chính mình, không commit hộ.
- Không tạo star, issue hay pull request giả.

## Header giấy phép

Mọi tệp mã đều có header SPDX ở dòng đầu. Ví dụ TypeScript:

```ts
// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 BeyondDreams
```

Ví dụ Java:

```java
// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 BeyondDreams
```

CI chạy `reuse lint` trên mỗi PR để bắt tệp quên header.

## Bí mật và dữ liệu mẫu

- Không commit `.env`, key, token, mật khẩu dưới bất kỳ hình thức nào.
- `.env.example` chỉ ghi giá trị giả.
- Dữ liệu mẫu tự tạo, đã ẩn danh, không có tên thật hay số điện thoại thật.
- Không sửa mã nguồn thư viện. Thư viện nào chưa kiểm chứng giấy phép
  OSI-approved thì không đưa vào.
