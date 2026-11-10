// SPDX-License-Identifier: Apache-2.0

// Người gọi đã xác thực bằng token Keycloak. Vai ở đây là vai nghiệp vụ
// (tên trong tệp định nghĩa luồng), đã dịch từ client role của Keycloak.
export interface Caller {
  userId: string;
  username: string;
  roles: string[];
}

// Request đã qua AuthGuard (guard gán user). Controller khai báo kiểu này
// để lấy caller mà không cần phụ thuộc express.
export interface AuthenticatedRequest {
  user: Caller;
}
