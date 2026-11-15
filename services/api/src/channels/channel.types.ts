// SPDX-License-Identifier: Apache-2.0

// Trạng thái hoạt động của 1 kênh bán. Kênh tạm dừng thì không nhận đơn
// mới, đơn cũ của kênh vẫn đi tiếp bình thường.
export type ChannelStatus = 'Hoạt động' | 'Tạm dừng';

// Một kênh nguồn đơn: nơi đơn hàng đi vào hệ thống (chat, web, điện
// thoại). Tên kênh duy nhất, so sánh chính xác cả hoa thường, giống biển
// số xe và tên đăng nhập tài xế. Kênh là chiều dữ liệu của lớp BI: dự báo
// nhu cầu và tỷ lệ hoàn tính theo từng kênh.
export interface Channel {
  id: string;
  name: string;
  description: string | null;
  status: ChannelStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CreateChannelInput {
  name: string;
  description?: string;
}

// Một mục trong tệp seed kênh bán (channels.seed.json).
export interface ChannelSeedItem {
  name: string;
  description: string;
}

// Lối ra vào kho kênh bán. Hiện có bản bộ nhớ; bản Postgres lưu bền qua
// cùng interface này, service phía trên không đổi. Mọi phương thức đều bất
// đồng bộ vì kho Postgres cần chờ truy vấn.
export interface ChannelStore {
  save(channel: Channel): Promise<void>;
  findById(id: string): Promise<Channel | null>;
  findByName(name: string): Promise<Channel | null>;
  list(): Promise<Channel[]>;
}
