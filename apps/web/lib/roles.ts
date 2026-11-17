// SPDX-License-Identifier: Apache-2.0

// Bản đồ vai nghiệp vụ -> màn được phép xem. MỘT hằng số duy nhất để
// Sơn sửa khi đổi phân quyền; Sidebar và chặn truy cập phía server đều
// đọc từ đây nên menu và quyền luôn khớp nhau.
// Chia theo ĐÚNG NGHIỆP VỤ, tức ai LÀM việc đó trong luồng đơn, khớp với
// luật vai đã có trong API (chuyển trạng thái nào vai nào được làm, ai
// được duyệt, ai được điều xe), không chia theo ai muốn xem:
// - Tổng quan là màn chỉ huy của Điều phối viên + Quản lý, không phải
//   màn chung, nên Nhân viên kho và CSKH không có.
// - Hàng đợi duyệt chỉ dành cho người duyệt (Quản lý/Quản trị viên);
//   Điều phối viên không duyệt nên không có.
// - Phân tách địa chỉ là việc xác nhận địa chỉ với khách nên chỉ CSKH +
//   Điều phối viên; Nhân viên kho không sửa địa chỉ.
// - Danh sách hạn chế do CSKH quản lý và Quản lý duyệt; Điều phối viên
//   không có.
// - Cuộc gọi (gộp từ Telesale cũ) nằm trong màn CSKH: gọi điện cho khách
//   là việc của CSKH; Điều phối viên cũng xem màn CSKH để chia đơn gọi
//   cho CSKH, và xem mức khẩn qua bảng SLA ở Tổng quan.
// - Kho thêm Quản lý để giám sát tồn.
// - Màn CSKH chỉ CSKH và Điều phối viên (chia đơn); Quản lý xem hiệu
//   suất CSKH qua Tổng quan/BI, không xem ticket.
// - Quản trị viên xem tất cả màn.
// - Màn Theo dõi (/tracking) cho mọi vai đã đăng nhập.
// - Tài khoản có nhiều vai thì hợp nhất các màn được phép.
// - Vai nào không có trong bảng (không ánh xạ được từ Keycloak) thì chỉ
//   xem được Theo dõi, để không bị khóa hẳn khỏi hệ thống.
// Key là vai nghiệp vụ tiếng Việt, giống hệt Session.roles trong lib/auth.ts.
// File này chỉ có hằng số và hàm thuần túy nên dùng được cả phía server
// lẫn phía client (Sidebar); không import 'server-only'.

// Thứ tự chuẩn của các màn, theo đúng thứ tự menu trong Sidebar.
export const SCREEN_ORDER: readonly string[] = [
  "/",
  "/orders",
  "/approval-queue",
  "/restricted-list",
  "/bi-dx-score",
  "/address-split",
  "/distribution",
  "/warehouse",
  "/customer-care",
  "/admin",
  "/driver",
  "/tracking",
];

export const ROLE_SCREENS: Record<string, readonly string[]> = {
  "Quản trị viên": SCREEN_ORDER,
  "Quản lý": [
    "/",
    "/orders",
    "/approval-queue",
    "/warehouse",
    "/restricted-list",
    "/bi-dx-score",
    "/tracking",
  ],
  "Điều phối viên": [
    "/",
    "/orders",
    "/warehouse",
    "/address-split",
    "/distribution",
    "/customer-care",
    "/tracking",
  ],
  "Nhân viên kho": ["/orders", "/warehouse", "/tracking"],
  "Nhân viên chăm sóc khách hàng": [
    "/orders",
    "/customer-care",
    "/address-split",
    "/restricted-list",
    "/tracking",
  ],
  "Tài xế": ["/driver", "/tracking"],
  "Khách hàng mô phỏng": ["/tracking"],
};

// Các màn được phép của (các) vai, theo đúng thứ tự menu chuẩn.
export function allowedScreens(roles: readonly string[]): string[] {
  const allowed = new Set<string>();
  for (const role of roles) {
    const screens = ROLE_SCREENS[role];
    if (screens) {
      for (const screen of screens) {
        allowed.add(screen);
      }
    }
  }
  const ordered = SCREEN_ORDER.filter((screen) => allowed.has(screen));
  return ordered.length > 0 ? ordered : ["/tracking"];
}

// Đưa đường dẫn thật về màn chứa nó: trang chi tiết đơn thuộc màn Đơn
// hàng, trang chi tiết tài xế thuộc màn Tài xế.
export function screenForPath(pathname: string): string {
  if (pathname.startsWith("/orders/")) {
    return "/orders";
  }
  if (pathname.startsWith("/driver/")) {
    return "/driver";
  }
  return pathname;
}

export function canAccessScreen(pathname: string, roles: readonly string[]): boolean {
  return allowedScreens(roles).includes(screenForPath(pathname));
}

// Màn đầu tiên được phép của vai, dùng để chuyển trang chủ về đúng màn.
export function firstAllowedScreen(roles: readonly string[]): string {
  return allowedScreens(roles)[0];
}
