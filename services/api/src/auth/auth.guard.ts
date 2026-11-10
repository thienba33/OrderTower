// SPDX-License-Identifier: Apache-2.0
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthService } from './auth.service';
import type { AuthenticatedRequest } from './auth.types';
import { IS_PUBLIC_KEY } from './public.decorator';

// Dùng toàn cục (APP_GUARD): mọi endpoint đều cần token hợp lệ, trừ endpoint
// đánh dấu @Public(). Phân quyền theo từng chuyển thì service tự kiểm tra
// trên caller.roles, guard chỉ xác thực.
@Injectable()
export class AuthGuard implements CanActivate {
  private readonly logger = new Logger(AuthGuard.name);

  constructor(
    private readonly auth: AuthService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }
    const request = context.switchToHttp().getRequest<
      AuthenticatedRequest & { headers: { authorization?: string } }
    >();
    const header = request.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      throw new UnauthorizedException('Thiếu access token.');
    }
    const token = header.slice('Bearer '.length).trim();
    if (token === '') {
      throw new UnauthorizedException('Thiếu access token.');
    }
    try {
      request.user = await this.auth.verifyToken(token);
    } catch (error) {
      this.logger.warn(
        `Xác thực token thất bại: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new UnauthorizedException(
        'Access token không hợp lệ hoặc đã hết hạn.',
      );
    }
    return true;
  }
}
