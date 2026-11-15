// SPDX-License-Identifier: Apache-2.0

// Một khách hàng: người nhận đơn. Số điện thoại duy nhất, so sánh chính
// xác cả khoảng trắng đầu cuối sau khi cắt (đã cắt thì " 0901 " và "0901"
// là 1 số). Địa chỉ giao hàng là chuỗi tự do tùy chọn, không bắt buộc và
// không qua bảng địa chỉ: khách lẻ ghi sao cũng được, mức tin cậy địa
// chỉ của đơn vẫn tính riêng từ địa chỉ trong đơn.
export interface Customer {
  id: string;
  name: string;
  phone: string;
  address: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCustomerInput {
  name: string;
  phone: string;
  address?: string;
}

// Lối ra vào kho khách hàng. Hiện có bản bộ nhớ; bản Postgres lưu bền qua
// cùng interface này, service phía trên không đổi. Mọi phương thức đều bất
// đồng bộ vì kho Postgres cần chờ truy vấn.
export interface CustomerStore {
  save(customer: Customer): Promise<void>;
  findById(id: string): Promise<Customer | null>;
  findByPhone(phone: string): Promise<Customer | null>;
  list(): Promise<Customer[]>;
}
