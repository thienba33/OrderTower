// SPDX-License-Identifier: Apache-2.0

// Trạng thái sẵn sàng làm việc của 1 xe. Xe đang giao thì không điều cho
// đơn khác được; xe bảo trì cũng vậy, chỉ điều xe đang sẵn sàng.
export type VehicleStatus = 'Sẵn sàng' | 'Đang giao' | 'Bảo trì';

// Một xe giao hàng. Biển số là định danh ngoài đời thật nên duy nhất; loại
// xe là chuỗi tự do (ví dụ "Xe máy", "Xe tải nhỏ"), không làm enum kín vì
// đội còn thêm loại xe khi mở rộng. Chưa có sức chở, GPS, tuyến đường hay
// tài xế gắn với xe: tài xế thuộc mô đun Driver làm sau.
export interface Vehicle {
  id: string;
  plate: string;
  type: string;
  status: VehicleStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CreateVehicleInput {
  plate: string;
  type: string;
}

// Lối ra vào kho xe. Hiện có bản bộ nhớ; bản Postgres lưu bền qua cùng
// interface này, service phía trên không đổi. Mọi phương thức đều bất đồng
// bộ vì kho Postgres cần chờ truy vấn.
export interface VehicleStore {
  save(vehicle: Vehicle): Promise<void>;
  findById(id: string): Promise<Vehicle | null>;
  findByPlate(plate: string): Promise<Vehicle | null>;
  list(): Promise<Vehicle[]>;
}
