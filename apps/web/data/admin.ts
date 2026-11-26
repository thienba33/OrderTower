// SPDX-License-Identifier: Apache-2.0
// Du lieu mau dong bang ngay 02/11/2026 cho man Quan tri he thong.
// Bang nguoi dung: 6 dong dau giu nguyen tung gia tri, 12 dong sau suy ra
// de du 18 ban ghi. Bang audit: 6 dong dau giu nguyen tung gia tri,
// 80 dong sau suy ra de du 86 ban ghi trong ngay.
// The KPI "Phien ban Workflow 4" giu nguyen: luong don hang chinh co
// 3 phien ban (v1, v2, v3) cong luong xu ly hoan hang v1, bang chi ve
// 3 dong (v3, v2 cua luong chinh va v1 cua luong hoan hang).

export const ADMIN_ROLES = [
  "Điều phối viên",
  "Nhân viên kho",
  "Nhân viên CSKH",
  "Quản lý",
  "Tài xế",
  "Quản trị viên",
  "Khách hàng mô phỏng",
] as const;

export type AdminRole = (typeof ADMIN_ROLES)[number];

export type UserStatus = "Đang hoạt động" | "Đã khóa";

export const USER_STATUS_PILL: Record<UserStatus, string> = {
  "Đang hoạt động": "bg-green-50 text-green-700",
  "Đã khóa": "bg-gray-100 text-gray-700",
};

export type AdminUser = {
  id: string;
  name: string;
  email: string;
  role: AdminRole;
  status: UserStatus;
  lastLogin: string;
};

const EXPLICIT_USERS: AdminUser[] = [
  { id: "U-01", name: "Sơn", email: "son@ordertower.demo", role: "Điều phối viên", status: "Đang hoạt động", lastLogin: "02/11 08:02" },
  { id: "U-02", name: "Lan", email: "lan@ordertower.demo", role: "Nhân viên kho", status: "Đang hoạt động", lastLogin: "02/11 08:05" },
  { id: "U-03", name: "Mai", email: "mai@ordertower.demo", role: "Nhân viên CSKH", status: "Đang hoạt động", lastLogin: "02/11 08:10" },
  { id: "U-04", name: "Thu", email: "thu@ordertower.demo", role: "Quản lý", status: "Đang hoạt động", lastLogin: "02/11 08:15" },
  { id: "U-05", name: "Văn Hùng", email: "hung@ordertower.demo", role: "Tài xế", status: "Đang hoạt động", lastLogin: "02/11 08:20" },
  { id: "U-06", name: "Admin", email: "admin@ordertower.demo", role: "Quản trị viên", status: "Đang hoạt động", lastLogin: "02/11 07:55" },
];

// [ten, email, vai tro, lan dang nhap]
const DERIVED_USER_SPECS: [string, string, AdminRole, string][] = [
  ["Đức Anh", "ducanh@ordertower.demo", "Nhân viên kho", "02/11 08:25"],
  ["Minh Quân", "minhquan@ordertower.demo", "Tài xế", "02/11 08:28"],
  ["Hoàng Nam", "hoangnam@ordertower.demo", "Nhân viên CSKH", "02/11 08:30"],
  ["Ngọc Anh", "ngocanh@ordertower.demo", "Điều phối viên", "02/11 08:32"],
  ["Phương Thảo", "phuongthao@ordertower.demo", "Quản lý", "02/11 08:35"],
  ["Quốc Bảo", "quocbao@ordertower.demo", "Nhân viên kho", "02/11 08:40"],
  ["Thanh Hằng", "thanhhang@ordertower.demo", "Tài xế", "02/11 08:42"],
  ["Tuấn Anh", "tuananh@ordertower.demo", "Nhân viên CSKH", "02/11 08:45"],
  ["Hồng Nhung", "hongnhung@ordertower.demo", "Điều phối viên", "02/11 08:47"],
  ["Việt Hoàng", "viethoang@ordertower.demo", "Tài xế", "02/11 08:50"],
  ["Thu Hằng", "thuhang@ordertower.demo", "Nhân viên kho", "02/11 08:52"],
  ["Đình Phúc", "dinhphuc@ordertower.demo", "Khách hàng mô phỏng", "02/11 08:55"],
];

export const ADMIN_USERS: AdminUser[] = [
  ...EXPLICIT_USERS,
  ...DERIVED_USER_SPECS.map(([name, email, role, lastLogin], index) => ({
    id: `U-${String(index + 7).padStart(2, "0")}`,
    name,
    email,
    role,
    status: "Đang hoạt động" as UserStatus,
    lastLogin,
  })),
];

export type WorkflowStatus = "Đang chạy" | "Đã thay thế";

export const WORKFLOW_STATUS_PILL: Record<WorkflowStatus, string> = {
  "Đang chạy": "bg-green-50 text-green-700",
  "Đã thay thế": "bg-gray-100 text-gray-700",
};

export type WorkflowDefinition = {
  id: string;
  name: string;
  version: string;
  status: WorkflowStatus;
  approver: string;
  appliedDate: string;
  canRollback: boolean;
};

export const WORKFLOW_DEFINITIONS: WorkflowDefinition[] = [
  { id: "WF-01", name: "Luồng đơn hàng chính", version: "v3", status: "Đang chạy", approver: "Thu (Quản lý)", appliedDate: "01/11/2026", canRollback: true },
  { id: "WF-02", name: "Luồng đơn hàng chính", version: "v2", status: "Đã thay thế", approver: "Thu (Quản lý)", appliedDate: "28/10/2026", canRollback: false },
  { id: "WF-03", name: "Luồng xử lý hoàn hàng", version: "v1", status: "Đang chạy", approver: "Sơn", appliedDate: "30/10/2026", canRollback: true },
];

// So phien ban Workflow va so ket noi that la so dong bang.
export const ADMIN_WORKFLOW_VERSIONS = 4;
export const ADMIN_REAL_CONNECTIONS = 0;

export type AuditResult = "Thành công" | "Đã duyệt" | "Chờ duyệt" | "Bị từ chối";

export type AuditRow = {
  time: string;
  user: string;
  action: string;
  target: string;
  result: AuditResult;
  hash: string;
};

function formatMinutes(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function auditHash(seed: string): string {
  let first = 0;
  let second = 0;
  for (let i = 0; i < seed.length; i += 1) {
    first = (first * 31 + seed.charCodeAt(i)) >>> 0;
    second = (second * 17 + seed.charCodeAt(i) * 7) >>> 0;
  }
  const hex = (value: number) => value.toString(16).padStart(8, "0");
  return `${hex(first).slice(0, 4)}...${hex(second).slice(0, 4)}`;
}

const EXPLICIT_AUDIT_ROWS: AuditRow[] = [
  { time: "09:40", user: "Văn Hùng", action: "Bắt đầu giao", target: "DH-1044", result: "Thành công", hash: "d1e6...83f0" },
  { time: "09:30", user: "Hệ thống", action: "Chặn chuyển trái phép", target: "DH-1061", result: "Bị từ chối", hash: "e2f7...91a4" },
  { time: "09:12", user: "Sơn", action: "Duyệt hiệu chỉnh địa chỉ", target: "DH-1044", result: "Đã duyệt", hash: "c802...47ab" },
  { time: "09:05", user: "Mai", action: "Đề xuất thêm hạn chế", target: "KH-058", result: "Chờ duyệt", hash: "f3a8...b612" },
  { time: "08:41", user: "AI chuẩn hóa", action: "Gắn cờ địa chỉ", target: "DH-1038", result: "Chờ duyệt", hash: "b377...9e11" },
  { time: "08:20", user: "AI chuẩn hóa", action: "Gắn cờ địa chỉ", target: "DH-1041", result: "Chờ duyệt", hash: "a91f...c204" },
];

const AUDIT_ACTIONS = [
  "Tạo đơn",
  "Chuyển trạng thái",
  "Duyệt hiệu chỉnh địa chỉ",
  "Gắn cờ địa chỉ",
  "Bắt đầu giao",
  "Đã giao",
  "Đề xuất nhập hàng",
  "Tạo yêu cầu hỗ trợ",
  "Đăng nhập",
  "Duyệt",
  "Chặn chuyển trái phép",
  "Cập nhật tồn kho",
];

const AUDIT_USERS = ["Sơn", "Mai", "Lan", "Thu", "Văn Hùng", "Minh Quân", "Đức Anh", "Hệ thống", "AI chuẩn hóa"];

const AUDIT_TARGETS = ["DH-1051", "DH-1041", "DH-1038", "DH-1033", "DH-1029", "DH-1061", "KH-058", "KH-027", "L-118", "H-052", "NH-031", "DH-1024"];

const AUDIT_RESULTS: AuditResult[] = ["Thành công", "Đã duyệt", "Thành công", "Chờ duyệt", "Thành công", "Bị từ chối"];

const DERIVED_AUDIT_ROWS: AuditRow[] = Array.from({ length: 80 }, (_, index) => ({
  time: formatMinutes(8 * 60 + 18 - index * 2),
  user: AUDIT_USERS[(index * 3) % AUDIT_USERS.length],
  action: AUDIT_ACTIONS[index % AUDIT_ACTIONS.length],
  target: AUDIT_TARGETS[(index * 5) % AUDIT_TARGETS.length],
  result: AUDIT_RESULTS[(index * 7) % AUDIT_RESULTS.length],
  hash: auditHash(`audit-${index}`),
}));

export const ADMIN_AUDIT_ROWS: AuditRow[] = [...EXPLICIT_AUDIT_ROWS, ...DERIVED_AUDIT_ROWS];

export type AdminSetting = {
  key: string;
  label: string;
  enabled: boolean;
};

export const ADMIN_SETTINGS: AdminSetting[] = [
  { key: "maintenance", label: "Chế độ bảo trì", enabled: false },
  { key: "registration", label: "Cho phép đăng ký mới", enabled: true },
];
