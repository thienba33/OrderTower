// SPDX-License-Identifier: Apache-2.0
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthenticatedRequest } from './auth.types';
import { ROLES_KEY } from './roles.decorator';

// Chạy sau AuthGuard. AuthGuard xác thực token và gắn request.user; guard
// này chỉ kiểm tra vai nghiệp vụ đã khai báo bằng @Roles. Không có @Roles
// thì mọi người dùng đã đăng nhập đều qua, giữ tương thích với các endpoint
// nội bộ cũ.
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) {
      return true;
    }
    const request = context
      .switchToHttp()
      .getRequest<AuthenticatedRequest>();
    const user = request.user;
    if (!user) {
      throw new UnauthorizedException('Thiếu thông tin người dùng.');
    }
    if (!user.roles.some((role) => required.includes(role))) {
      throw new ForbiddenException(
        `Cần một trong các vai: ${required.join(', ')}.`,
      );
    }
    return true;
  }
}
