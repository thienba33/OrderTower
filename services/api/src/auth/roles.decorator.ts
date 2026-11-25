// SPDX-License-Identifier: Apache-2.0
import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';

// Gắn danh sách vai nghiệp vụ được phép gọi handler/controller.
// Không gắn @Roles nghĩa là chỉ cần đăng nhập (AuthGuard toàn cục).
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
