// SPDX-License-Identifier: Apache-2.0

// Trạng thái sẵn sàng làm việc của 1 tài xế. Tài xế đang giao thì không
// điều cho đơn khác được; tài xế tạm nghỉ cũng vậy, chỉ điều tài xế đang
// sẵn sàng.
export type DriverStatus = 'Sẵn sàng' | 'Đang giao' | 'Tạm nghỉ';

// Một tài xế giao hàng. username là tên đăng nhập Keycloak của tài xế,
// dùng để kiểm tra quyền sở hữu ở giao hàng và giao thất bại: chỉ đúng
// tài xế được giao cho shipment mới giao hàng hoặc báo thất bại cho
// shipment đó. phone và username đều duy nhất; vehicleId là xe tài xế
// thường lái, có thể null, không bắt buộc trùng xe điều ở dispatch.
export interface Driver {
  id: string;
  name: string;
  phone: string;
  username: string;
  vehicleId: string | null;
  status: DriverStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CreateDriverInput {
  name: string;
  phone: string;
  username: string;
}

export interface AssignVehicleInput {
  vehicleId: string;
}

// Lối ra vào kho tài xế. Hiện có bản bộ nhớ; bản Postgres lưu bền qua cùng
// interface này, service phía trên không đổi. Mọi phương thức đều bất đồng
// bộ vì kho Postgres cần chờ truy vấn.
export interface DriverStore {
  save(driver: Driver): Promise<void>;
  findById(id: string): Promise<Driver | null>;
  findByUsername(username: string): Promise<Driver | null>;
  findByPhone(phone: string): Promise<Driver | null>;
  list(): Promise<Driver[]>;
}
