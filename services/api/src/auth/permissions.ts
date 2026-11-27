// SPDX-License-Identifier: Apache-2.0

// Tên vai nghiệp vụ dùng xuyên suốt API. Tên phải khớp chính xác với
// KEYCLOAK_ROLE_TO_DEFINITION_ROLE trong roles.ts và dữ liệu seed.
export const BUSINESS_ROLE = {
  ADMIN: 'Quản trị viên',
  MANAGER: 'Quản lý',
  DISPATCHER: 'Điều phối viên',
  WAREHOUSE: 'Nhân viên kho',
  CUSTOMER_SERVICE: 'Nhân viên chăm sóc khách hàng',
  DRIVER: 'Tài xế',
  CUSTOMER: 'Khách hàng mô phỏng',
} as const;

export type BusinessRole = (typeof BUSINESS_ROLE)[keyof typeof BUSINESS_ROLE];

const {
  ADMIN,
  MANAGER,
  DISPATCHER,
  WAREHOUSE,
  CUSTOMER_SERVICE,
  DRIVER,
  CUSTOMER,
} = BUSINESS_ROLE;

// Toàn bộ vai nội bộ (không gồm khách hàng mô phỏng). Dùng cho các endpoint
// đọc dữ liệu vận hành chung như đơn, kho, kênh, xe, tài xế.
export const INTERNAL_ROLES: readonly string[] = [
  ADMIN,
  MANAGER,
  DISPATCHER,
  WAREHOUSE,
  CUSTOMER_SERVICE,
  DRIVER,
];

// Vai được xem danh sách/chi tiết đơn hàng. Tài xế chỉ xem đơn được giao
// qua kiểm tra shipment riêng, không dùng danh sách đơn chung.
export const ORDER_VIEW_ROLES: readonly string[] = [
  ADMIN,
  MANAGER,
  DISPATCHER,
  WAREHOUSE,
  CUSTOMER_SERVICE,
];

// Vai được tạo/sửa đơn. Workflow vẫn kiểm tra vai ở từng bước chuyển.
export const ORDER_WRITE_ROLES: readonly string[] = [
  ADMIN,
  MANAGER,
  DISPATCHER,
  CUSTOMER_SERVICE,
];

// Vai có thể gọi endpoint chuyển trạng thái đơn trực tiếp. Service workflow
// vẫn kiểm tra đúng vai của từng chuyển; đây chỉ là lớp chặn thô.
export const ORDER_TRANSITION_ROLES: readonly string[] = [
  ADMIN,
  MANAGER,
  DISPATCHER,
  WAREHOUSE,
  DRIVER,
];

export const SHIPMENT_READ_ROLES: readonly string[] = INTERNAL_ROLES;

export const SHIPMENT_WRITE_ROLES: readonly string[] = [
  ADMIN,
  MANAGER,
  DISPATCHER,
  DRIVER,
];

export const DELIVERY_EVENT_READ_ROLES: readonly string[] = INTERNAL_ROLES;

export const DELIVERY_EVENT_WRITE_ROLES: readonly string[] = [
  ADMIN,
  DISPATCHER,
  DRIVER,
];

export const ASSIGNMENT_READ_ROLES: readonly string[] = [
  ADMIN,
  MANAGER,
  DISPATCHER,
  WAREHOUSE,
  CUSTOMER_SERVICE,
];

export const ASSIGNMENT_WRITE_ROLES: readonly string[] = [
  ADMIN,
  DISPATCHER,
  WAREHOUSE,
  CUSTOMER_SERVICE,
];

export const CALL_LOG_READ_ROLES: readonly string[] = [
  ADMIN,
  MANAGER,
  DISPATCHER,
  CUSTOMER_SERVICE,
];

export const CALL_LOG_WRITE_ROLES: readonly string[] = [CUSTOMER_SERVICE];

export const RETURN_READ_ROLES: readonly string[] = [
  ADMIN,
  MANAGER,
  DISPATCHER,
  WAREHOUSE,
  CUSTOMER_SERVICE,
];

export const RETURN_WRITE_ROLES: readonly string[] = [
  ADMIN,
  MANAGER,
  DISPATCHER,
  CUSTOMER_SERVICE,
];

export const INVENTORY_READ_ROLES: readonly string[] = INTERNAL_ROLES;

export const CHANNEL_READ_ROLES: readonly string[] = INTERNAL_ROLES;

export const CUSTOMER_READ_ROLES: readonly string[] = [
  ADMIN,
  MANAGER,
  DISPATCHER,
  CUSTOMER_SERVICE,
];

export const VEHICLE_READ_ROLES: readonly string[] = INTERNAL_ROLES;

export const VEHICLE_WRITE_ROLES: readonly string[] = [
  ADMIN,
  MANAGER,
  DISPATCHER,
];

export const DRIVER_READ_ROLES: readonly string[] = INTERNAL_ROLES;

export const DRIVER_WRITE_ROLES: readonly string[] = [
  ADMIN,
  MANAGER,
  DISPATCHER,
];

// Audit là dữ liệu nội bộ; tài xế không cần đọc audit, verify chỉ
// quản lý/admin. Các vai văn phòng còn lại đọc được để xem lịch sử đơn.
export const AUDIT_READ_ROLES: readonly string[] = [
  ADMIN,
  MANAGER,
  DISPATCHER,
  WAREHOUSE,
  CUSTOMER_SERVICE,
];
export const AUDIT_VERIFY_ROLES: readonly string[] = [ADMIN, MANAGER];

export const BI_READ_ROLES: readonly string[] = [ADMIN, MANAGER];

export const RESTRICTED_FLAG_READ_ROLES: readonly string[] = [
  ADMIN,
  MANAGER,
  CUSTOMER_SERVICE,
];

export const TICKET_READ_ROLES: readonly string[] = [
  ADMIN,
  MANAGER,
  DISPATCHER,
  CUSTOMER_SERVICE,
];

export const APPROVAL_READ_ROLES: readonly string[] = [
  ADMIN,
  MANAGER,
  DISPATCHER,
];

export const WORKFLOW_READ_ROLES: readonly string[] = INTERNAL_ROLES;

export const WORKFLOW_INSTANCE_ROLES: readonly string[] = [ADMIN, MANAGER];

// Deploy definition mới là thay đổi cấu hình luồng, chỉ quản lý/admin.
export const WORKFLOW_DEPLOY_ROLES: readonly string[] = [ADMIN, MANAGER];

// Outbox là dữ liệu vận hành nội bộ, chỉ quản lý/admin xem và relay.
export const OUTBOX_ROLES: readonly string[] = [ADMIN, MANAGER];

// Telemetry/twin là dữ liệu vận hành; toàn bộ vai nội bộ được đọc. Chỉ vai
// điều hành được tạo dữ liệu mô phỏng cho demo.
export const TELEMETRY_READ_ROLES: readonly string[] = INTERNAL_ROLES;
export const TELEMETRY_WRITE_ROLES: readonly string[] = [
  ADMIN,
  MANAGER,
  DISPATCHER,
];

// Archive/lakehouse là dữ liệu quản trị; chỉ quản lý và quản trị viên.
export const ARCHIVE_READ_ROLES: readonly string[] = [ADMIN, MANAGER];
export const ARCHIVE_WRITE_ROLES: readonly string[] = [ADMIN, MANAGER];

export function hasAnyRole(
  callerRoles: readonly string[],
  allowed: readonly string[],
): boolean {
  return callerRoles.some((role) => allowed.includes(role));
}

const PRIVILEGED_ROLES: readonly string[] = [ADMIN, MANAGER, DISPATCHER];

// Tài xế thuần (không kèm vai điều phối/quản lý/admin) chỉ được thấy dữ
// liệu của chính mình. Nếu một tài khoản có thêm vai quản lý, coi như vai
// quản lý để không chặn nhầm.
export function isDriverOnly(callerRoles: readonly string[]): boolean {
  return (
    callerRoles.includes(DRIVER) &&
    !callerRoles.some((role) => PRIVILEGED_ROLES.includes(role))
  );
}

export function isDispatcherOrAbove(callerRoles: readonly string[]): boolean {
  return callerRoles.some((role) => PRIVILEGED_ROLES.includes(role));
}
