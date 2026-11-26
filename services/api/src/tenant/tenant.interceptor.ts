// SPDX-License-Identifier: Apache-2.0
import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Observable } from 'rxjs';
import { TenantContextService } from './tenant-context.service';

// AuthGuard chạy trước interceptor nên request.user đã có tenantId. Endpoint
// public không có user thì dùng tenant mặc định.
@Injectable()
export class TenantContextInterceptor implements NestInterceptor {
  constructor(private readonly context: TenantContextService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<{
      user?: { tenantId?: string };
    }>();
    return this.context.run(request.user?.tenantId, () => next.handle());
  }
}
